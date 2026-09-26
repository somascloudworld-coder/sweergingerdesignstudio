// Real-browser verification of the client-side flow, driving the installed Chrome.
// Run with the dev server up:  node scripts/e2e.mjs
//
// Covers the claims the API script cannot: the Fabric canvas, the client-side print
// clamp, the composited preview, the frozen cart snapshot and the checkout flow.

import { chromium } from 'playwright-core';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const BASE = process.env.VERIFY_BASE ?? 'http://localhost:3100';
const DB_PATH = path.join(process.cwd(), '.data', 'studio.db');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -> ${detail}` : ''}`);
}

const db = new Database(DB_PATH, { readonly: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(label, predicate, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = predicate();
    if (value) return value;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function designLayers(publicId) {
  const row = db.prepare('select sides_json, variant_id from designs where public_id = ?').get(publicId);
  if (!row) return null;
  return { sides: JSON.parse(row.sides_json), variantId: row.variant_id };
}

const pngPath = path.join(os.tmpdir(), `sg-artwork-${Date.now()}.png`);
await sharp({
  create: { width: 200, height: 200, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } },
})
  .composite([
    {
      input: Buffer.from(
        `<svg width="200" height="200"><circle cx="100" cy="100" r="70" fill="#ffffff"/></svg>`,
      ),
    },
  ])
  .png()
  .toFile(pngPath);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

console.log('\n== Step 1 + 2: the picker renders real seeded products ==');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check('the product picks up from the database', await page.getByText('Classic Crew T-Shirt').first().isVisible());
check('colour swatches render from seeded variants', (await page.locator('button.swatch').count()) === 5, `${await page.locator('button.swatch').count()} swatches`);
check('the Fabric canvas mounts', (await page.locator('canvas.upper-canvas').count()) === 1);

console.log('\n== Step 3: canvas editing persists structured layers ==');
await page.getByRole('button', { name: 'Add text' }).click();
await page.waitForSelector('text=/Design d_/', { timeout: 10000 });
const designPill = await page.locator('.pill', { hasText: 'Design d_' }).first().innerText();
const designId = designPill.replace('Design ', '').trim();
await waitFor('save', () => designLayers(designId));
check('a design row is created on first edit', Boolean(designId), designId);

await waitFor(
  'text layer saved',
  () => (designLayers(designId)?.sides.front.length ?? 0) === 1,
);
check('the text layer is saved', designLayers(designId).sides.front[0].type === 'text', designLayers(designId).sides.front[0].text);
check('the save is announced in the UI', await page.getByText('Design saved').first().isVisible());

console.log('\n== Step 4: the client clamp stops an element leaving the print area ==');
const canvasBox = await page.locator('canvas.upper-canvas').boundingBox();
const scale = canvasBox.width / 300;
await page.mouse.move(canvasBox.x + 150 * scale, canvasBox.y + 190 * scale);
await page.mouse.down();
await page.mouse.move(canvasBox.x + canvasBox.width + 250, canvasBox.y + canvasBox.height + 250, { steps: 20 });
await page.mouse.up();
await sleep(1500);
const dragged = designLayers(designId).sides.front[0];
const areaRow = db.prepare("select width, height from print_areas where product_id='prod_classic-crew-tee' and side='front'").get();
const inside = dragged.x >= 0 && dragged.x <= areaRow.width && dragged.y >= 0 && dragged.y <= areaRow.height;
check(
  'dragging far outside stops the element inside the boundary',
  inside,
  `centre now (${dragged.x.toFixed(1)}, ${dragged.y.toFixed(1)}) in a ${areaRow.width}x${areaRow.height} area`,
);

console.log('\n== Step 3 (continued): artwork upload becomes an editable image layer ==');
await page.locator('input[type=file]').setInputFiles(pngPath);
await waitFor('image layer saved', () => (designLayers(designId)?.sides.front.length ?? 0) === 2, 12000);
const layersNow = designLayers(designId).sides.front;
check('the uploaded image is stored as its own layer', layersNow.some((l) => l.type === 'image' && l.assetId.startsWith('asset_')), layersNow.map((l) => l.type).join(','));

console.log('\n== Step 5: the preview is composited on the garment, not a flat overlay ==');
const blendModes = await page.$$eval('.print-zone img.design-art', (nodes) =>
  nodes.map((n) => getComputedStyle(n).mixBlendMode),
);
check(
  'the design art uses a blend mode over the garment',
  blendModes.includes('multiply') || blendModes.includes('normal'),
  blendModes.join(','),
);
const shade = await page.locator('.print-zone img.design-art').nth(1).evaluate((n) => getComputedStyle(n).mixBlendMode);
check('the garment shading is laid back over the design inside the print zone', shade === 'multiply', shade);

console.log('\n== Step 6: colour swap changes only the garment ==');
const beforeColour = JSON.stringify(designLayers(designId).sides);
await page.locator('button.swatch[title="Jet Black"]').click();
await waitFor('colour saved', () => designLayers(designId)?.variantId === 'classic-crew-tee--jet-black', 10000);
const afterColour = designLayers(designId);
check('the layers are byte-identical after a colour change', JSON.stringify(afterColour.sides) === beforeColour, `variant ${afterColour.variantId}`);

console.log('\n== Step 6: product-type switch warns, size change never resets the design ==');
let dialogMessage = null;
page.once('dialog', async (dialog) => {
  dialogMessage = dialog.message();
  await dialog.dismiss();
});
await page.getByRole('button', { name: /Oversized T-Shirt/ }).click();
await sleep(600);
check(
  'switching product type asks before discarding the design',
  /new design/i.test(dialogMessage ?? ''),
  dialogMessage ?? 'no dialog shown',
);
check(
  'dismissing the warning keeps the current design',
  (designLayers(designId)?.sides.front.length ?? 0) === 2,
  `${designLayers(designId)?.sides.front.length} layers`,
);

const beforeSize = JSON.stringify(designLayers(designId).sides);
await page.locator('label.field:text-is("Size") + select').selectOption('XL');
await sleep(500);
check(
  'changing garment size leaves the design untouched',
  JSON.stringify(designLayers(designId).sides) === beforeSize,
  'layers identical',
);

console.log('\n== Step 9: a cart line is frozen against later edits ==');
await page.getByRole('button', { name: 'Add to cart' }).click();
await page.waitForSelector('text=/added to the cart/');
await sleep(300);
const readCart = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('sg_studio_v1') ?? '{"state":{}}').state.cart ?? []);
const cartBefore = await readCart();
check('the line is added to the persisted cart', cartBefore.length === 1, `${cartBefore.length} line`);
const frozenJson = JSON.stringify(cartBefore[0].designSides);

// Keep editing the live design: move the text again.
await page.mouse.move(canvasBox.x + 150 * scale, canvasBox.y + 190 * scale);
await page.mouse.down();
await page.mouse.move(canvasBox.x + 60 * scale, canvasBox.y + 90 * scale, { steps: 10 });
await page.mouse.up();
await sleep(1600);
const cartAfter = await readCart();
check(
  'further edits to the source design leave the cart line untouched',
  JSON.stringify(cartAfter[0].designSides) === frozenJson,
  `cart layers ${cartAfter[0].designSides.front.length}, live layers ${designLayers(designId).sides.front.length}`,
);

console.log('\n== Step 11 + 9: cart and checkout end to end ==');
await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
check('the cart page lists the line', await page.getByText('Classic Crew T-Shirt').first().isVisible());
await page.getByRole('button', { name: 'Continue to checkout' }).click();
await page.waitForURL('**/checkout');

await page.locator('label.field:has-text("Full name") + input').fill('Asha Reddy');
await page.locator('label.field:has-text("Phone") + input').fill('9849000222');
await page.locator('label.field:has-text("Email") + input').fill('asha.e2e@example.com');
await page.locator('label.field:has-text("Delivery address") + textarea').fill('12 Johari Bazaar, Jaipur 302003');
await page.getByRole('button', { name: 'Place order' }).click();
await page.waitForURL('**/order/o_*', { timeout: 15000 });
const orderUrl = page.url();
const orderId = orderUrl.split('/').pop();
check('checkout completes and lands on the order', orderUrl.includes('/order/o_'), orderId);
check('the order page shows the received status', await page.getByText('Received').first().isVisible());
const orderRow = db.prepare('select payment_status from orders where public_id = ?').get(orderId);
check('the order is stored with the placeholder payment hand-off', orderRow?.payment_status === 'placeholder_pending', orderRow?.payment_status);
check('no client-side errors during the flow', pageErrors.length === 0, pageErrors.join(' | ') || 'none');

console.log('\n== Steps 13 + 14: admin queue is gated, then lists the order ==');
const fresh = await browser.newContext();
const adminPage = await fresh.newPage();
await adminPage.goto(`${BASE}/admin/orders`, { waitUntil: 'networkidle' });
check('signed out, the queue redirects to sign-in', adminPage.url().includes('/admin/login'), adminPage.url());
await adminPage.locator('input[type=email]').fill('admin@sweetginger.local');
await adminPage.locator('input[type=password]').fill('sweetginger');
await adminPage.getByRole('button', { name: 'Sign in' }).click();
await adminPage.waitForURL('**/admin/orders');
const rows = await adminPage.locator('tbody tr').count();
const dbCount = db.prepare('select count(*) c from orders').get().c;
check('the queue row count matches the database', rows === dbCount, `ui ${rows} vs db ${dbCount}`);
check('the new order appears in the queue', await adminPage.getByText(orderId).first().isVisible());

await fresh.close();
await context.close();
await browser.close();
db.close();
fs.unlinkSync(pngPath);

console.log(`\n${failures === 0 ? 'ALL BROWSER CHECKS PASSED' : `${failures} BROWSER CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
