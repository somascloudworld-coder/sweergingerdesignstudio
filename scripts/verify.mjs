// End-to-end verification against a running dev server. Run:
//   node scripts/verify.mjs
// Prints one line per check with the real value it saw.

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.env.VERIFY_BASE ?? 'http://localhost:3100';
const DB_PATH = path.join(process.cwd(), '.data', 'studio.db');

let failures = 0;
function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures += 1;
  console.log(`${mark}  ${name}${detail ? ` -> ${detail}` : ''}`);
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 300) };
  }
}

// ------------------------------------------------------------------ step 1 + 2
console.log('\n== Steps 1-2: real product data, no secrets in the browser ==');
const home = await fetch(`${BASE}/`);
const html = await home.text();
check('GET / returns 200', home.status === 200, `status ${home.status}`);

const db = new Database(DB_PATH, { readonly: true });
const productRow = db.prepare('select name from products order by rowid asc limit 1').get();
check(
  'the page renders the product name from a real database row',
  html.includes(productRow.name),
  `db="${productRow.name}" present=${html.includes(productRow.name)}`,
);
const variantCount = db.prepare('select count(*) c from product_variants').get().c;
const areaCount = db.prepare('select count(*) c from print_areas').get().c;
check('product_variants seeded', variantCount === 10, `${variantCount} variants`);
check('print_areas seeded per product x side', areaCount === 2, `${areaCount} areas`);

const garmentPath = db
  .prepare("select image_path from product_variants where id = 'classic-crew-tee--optic-white'")
  .get().image_path;
const garment = await fetch(`${BASE}${garmentPath}`);
check(
  'garment art is served from public/ (not the writable-data folder)',
  garment.status === 200 && garment.headers.get('content-type') === 'image/png',
  `${garmentPath} -> ${garment.status} ${garment.headers.get('content-type')}`,
);
check(
  'no product image depends on the local data folder',
  !db
    .prepare("select count(*) c from product_variants where image_path like '/api/media%'")
    .get().c,
  `${db.prepare("select count(*) c from product_variants where image_path like '/garments/%'").get().c} of ${variantCount} point at /garments/`,
);

// Scan every script the browser downloads for a server-side secret.
const scriptSrcs = [...html.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
const secretPatterns = [/sb_secret_/, /SUPABASE_SERVICE_ROLE_KEY/, /service_role/, /sk-[a-zA-Z0-9]{20,}/];
let leaked = null;
let scanned = 0;
for (const src of scriptSrcs) {
  const url = src.startsWith('http') ? src : `${BASE}${src}`;
  const res = await fetch(url);
  if (!res.ok) continue;
  const body = await res.text();
  scanned += 1;
  for (const pattern of secretPatterns) {
    if (pattern.test(body)) leaked = `${src} matched ${pattern}`;
  }
}
check(
  'no server-side secret appears in any browser-downloaded script',
  leaked === null,
  `${scanned} bundles scanned; ${leaked ?? 'clean'}`,
);

console.log('\n== Deployment self-check (/api/health) ==');
const healthResponse = await fetch(`${BASE}/api/health`);
const healthText = await healthResponse.text();
const health = JSON.parse(healthText);
check(
  'the health endpoint reports the backend it actually selected',
  healthResponse.status === 200 && health.ok === true && health.backend?.selected === 'local',
  `status ${healthResponse.status}, backend ${health.backend?.selected}`,
);
check(
  'the health endpoint proves the database answers, not just that config exists',
  health.database?.reachable === true && health.database?.products === 2,
  `reachable ${health.database?.reachable}, products ${health.database?.products}`,
);
check(
  'the health endpoint names each variable without printing a value',
  Array.isArray(health.variables) &&
    health.variables.every((v) => typeof v.present === 'boolean' && !('value' in v)),
  health.variables?.map((v) => `${v.name}:${v.present ? 'present' : 'MISSING'}`).join(', '),
);
const looksLikeASecret = /sb_secret_[A-Za-z0-9]{10,}|sb_publishable_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}\./;
check(
  'the health endpoint leaks no key material',
  !looksLikeASecret.test(healthText),
  `${healthText.length} bytes inspected`,
);

// ------------------------------------------------------------------ step 3
console.log('\n== Step 3: design stored as structured layer JSON ==');
const productId = 'prod_classic-crew-tee';
const variantId = 'classic-crew-tee--optic-white';

const created = await json(
  await fetch(`${BASE}/api/designs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId, variantId }),
  }),
);
check('POST /api/designs creates a design', typeof created.publicId === 'string', created.publicId);

const textLayer = {
  id: 'l_text',
  type: 'text',
  x: 150,
  y: 150,
  width: 200,
  height: 44,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  z: 1,
  text: 'Sweet Ginger',
  fontFamily: 'Arial',
  fontSize: 34,
  fill: '#111111',
  fontWeight: 'bold',
  fontStyle: 'normal',
  textAlign: 'center',
};
const imageLayer = {
  id: 'l_img',
  type: 'image',
  x: 150,
  y: 280,
  width: 120,
  height: 120,
  scaleX: 1,
  scaleY: 1,
  angle: 12,
  z: 2,
  assetId: 'asset_placeholder',
  opacity: 1,
};

const saved = await fetch(`${BASE}/api/designs/${created.publicId}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ variantId, sides: { front: [textLayer, imageLayer], back: [] } }),
});
check('PUT saves a design with a text and an image layer', saved.status === 200, `status ${saved.status}`);

const reloaded = await json(await fetch(`${BASE}/api/designs/${created.publicId}`));
check(
  'the reloaded design has two independently editable layers, not a flattened image',
  reloaded.sides.front.length === 2 &&
    reloaded.sides.front[0].type === 'text' &&
    reloaded.sides.front[1].type === 'image' &&
    reloaded.sides.front[1].angle === 12,
  `layers=${reloaded.sides.front.map((l) => l.type).join(',')}`,
);
const storedRow = db.prepare('select sides_json from designs where public_id = ?').get(created.publicId);
check('the stored row is JSON text, not a binary blob', storedRow.sides_json.trim().startsWith('{'), storedRow.sides_json.slice(0, 60));

// ------------------------------------------------------------------ step 4
console.log('\n== Step 4: print-area clamp enforced server-side ==');
const outOfBounds = { ...textLayer, x: 4000, y: 4000 };
const rejected = await fetch(`${BASE}/api/designs/${created.publicId}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ variantId, sides: { front: [outOfBounds], back: [] } }),
});
const rejectionBody = await json(rejected);
check(
  'an out-of-bounds save is rejected even with the client bypassed',
  rejected.status === 422 && rejectionBody.issues?.[0]?.code === 'out_of_bounds',
  `status ${rejected.status}, code ${rejectionBody.issues?.[0]?.code}`,
);
const afterReject = await json(await fetch(`${BASE}/api/designs/${created.publicId}`));
check(
  'the rejected save wrote nothing (design still has its two layers)',
  afterReject.sides.front.length === 2,
  `${afterReject.sides.front.length} layers`,
);

// ------------------------------------------------------------------ step 6
console.log('\n== Step 6: colour change never touches the design ==');
const beforeColour = JSON.stringify(afterReject.sides);
await fetch(`${BASE}/api/designs/${created.publicId}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ variantId: 'classic-crew-tee--jet-black', sides: afterReject.sides }),
});
const afterColour = await json(await fetch(`${BASE}/api/designs/${created.publicId}`));
check(
  'switching colour leaves the layers byte-identical',
  JSON.stringify(afterColour.sides) === beforeColour,
  `variant now ${afterColour.variantId}`,
);

// ------------------------------------------------------------------ step 7
console.log('\n== Step 7: server-authoritative tiered pricing ==');
async function quote(quantity, extra = {}) {
  const res = await fetch(`${BASE}/api/orders/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      lines: [
        {
          productId,
          variantId,
          printMethod: 'DTF',
          sizes: [{ size: 'M', qty: quantity }],
          ...extra,
        },
      ],
    }),
  });
  return json(res);
}
const q1 = await quote(1);
const q9 = await quote(9);
const q10 = await quote(10);
const q50 = await quote(50);
check('1 unit uses the base tier', q1.lines[0].unitPricePaise === 49900, `${q1.lines[0].unitPricePaise}`);
check('9 units still use the base tier', q9.lines[0].unitPricePaise === 49900, `${q9.lines[0].unitPricePaise}`);
check('10 units cross into the bulk tier', q10.lines[0].unitPricePaise === 42900, `${q10.lines[0].unitPricePaise}`);
check('50 units cross into the top tier', q50.lines[0].unitPricePaise === 37900, `${q50.lines[0].unitPricePaise}`);
const qForged = await quote(10, { unitPricePaise: 1, lineTotalPaise: 1 });
check(
  'a client-forged price is ignored and recalculated',
  qForged.lines[0].unitPricePaise === 42900 && qForged.totalPaise === 429000,
  `unit ${qForged.lines[0].unitPricePaise}, total ${qForged.totalPaise}`,
);

// ------------------------------------------------------------------ step 10
console.log('\n== Step 10: no order without artwork, read broadly ==');
const customer = {
  name: 'Asha Reddy',
  phone: '9849000111',
  email: 'asha@example.com',
  address: '12 Johari Bazaar, Jaipur 302003',
};
const emptyOrder = await json(
  await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orderType: 'B2C',
      customer,
      lines: [
        {
          productId,
          variantId,
          printMethod: 'DTF',
          sizes: [{ size: 'M', qty: 1 }],
          designSides: { front: [], back: [] },
          designPublicId: null,
        },
      ],
    }),
  }),
);
check(
  'an empty (never-designed) line is rejected',
  emptyOrder.code === 'NO_ARTWORK',
  `code=${emptyOrder.code}`,
);

const textOnly = await fetch(`${BASE}/api/orders`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    orderType: 'B2C',
    customer,
    lines: [
      {
        productId,
        variantId,
        printMethod: 'DTF',
        sizes: [{ size: 'M', qty: 1 }],
        designSides: { front: [textLayer], back: [] },
        designPublicId: created.publicId,
      },
    ],
  }),
});
const textOnlyBody = await json(textOnly);
check(
  'a text-only design (no upload) is accepted',
  textOnly.status === 201 && typeof textOnlyBody.publicId === 'string',
  `status ${textOnly.status}, ref ${textOnlyBody.publicId}`,
);

// ------------------------------------------------------------------ steps 8 + 11
console.log('\n== Steps 8 + 11: two order shapes, both persist with the design ==');
const b2b = await json(
  await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orderType: 'B2B',
      customer: { ...customer, name: 'Acme Events', company: 'Acme Events Pvt Ltd', gstin: '08ABCDE1234F1Z5' },
      lines: [
        {
          productId: 'prod_oversized-tee',
          variantId: 'oversized-tee--navy',
          printMethod: 'DTF',
          sizes: [
            { size: 'M', qty: 10 },
            { size: 'L', qty: 25 },
            { size: 'XL', qty: 5 },
          ],
          designSides: { front: [textLayer], back: [] },
          designPublicId: null,
        },
      ],
    }),
  }),
);
check('a B2B bulk order is created', typeof b2b.publicId === 'string', `ref ${b2b.publicId}, total ${b2b.totalPaise}`);

const b2cOrder = db
  .prepare("select order_type, status, payment_status from orders where public_id = ?")
  .get(textOnlyBody.publicId);
const b2bOrder = db.prepare('select order_type from orders where public_id = ?').get(b2b.publicId);
check('B2C row has one size', db.prepare(
  'select count(*) c from order_item_sizes s join order_items i on i.id = s.order_item_id join orders o on o.id = i.order_id where o.public_id = ?',
).get(textOnlyBody.publicId).c === 1, 'one size row');
check('B2B row has a size grid', db.prepare(
  'select count(*) c from order_item_sizes s join order_items i on i.id = s.order_item_id join orders o on o.id = i.order_id where o.public_id = ?',
).get(b2b.publicId).c === 3, 'three size rows');
check(
  'both order types live in the same table with the same shape',
  b2cOrder.order_type === 'B2C' && b2bOrder.order_type === 'B2B',
  `${b2cOrder.order_type} / ${b2bOrder.order_type}`,
);
check(
  'the order carries its own frozen design',
  db.prepare(
    "select json_extract(design_snapshot_json, '$.front[0].text') t from order_items i join orders o on o.id = i.order_id where o.public_id = ?",
  ).get(textOnlyBody.publicId).t === 'Sweet Ginger',
  'snapshot text recovered from the order',
);
check(
  'payment is a flagged placeholder (D6 unresolved)',
  b2cOrder.payment_status === 'placeholder_pending' && b2cOrder.status === 'placed',
  `${b2cOrder.status}/${b2cOrder.payment_status}`,
);

// freeze test: edit the live design, ensure the order does not change
await fetch(`${BASE}/api/designs/${created.publicId}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ variantId, sides: { front: [textLayer, imageLayer], back: [] } }),
});
const snapshotCount = db.prepare(
  "select json_array_length(json_extract(design_snapshot_json, '$.front')) n from order_items i join orders o on o.id = i.order_id where o.public_id = ?",
).get(textOnlyBody.publicId).n;
check(
  'editing the source design afterwards does not change the placed order (frozen snapshot)',
  snapshotCount === 1,
  `${snapshotCount} layer(s) frozen in the order`,
);

// ------------------------------------------------------------------ step 14 gate
console.log('\n== Step 14: admin queue is staff-gated ==');
const anon = await fetch(`${BASE}/api/admin/orders`);
check('the admin API rejects an anonymous request', anon.status === 401, `status ${anon.status}`);

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@sweetginger.local', password: 'sweetginger' }),
});
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
check('staff sign-in returns a session cookie', login.status === 200 && cookie.startsWith('sg_staff='), `${login.status}`);

const badLogin = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@sweetginger.local', password: 'nope' }),
});
check('a wrong password is rejected', badLogin.status === 401, `status ${badLogin.status}`);

const adminList = await json(await fetch(`${BASE}/api/admin/orders`, { headers: { cookie } }));
const dbOrderCount = db.prepare('select count(*) c from orders').get().c;
check(
  'the admin queue matches the database exactly',
  adminList.orders?.length === dbOrderCount,
  `api ${adminList.orders?.length} vs db ${dbOrderCount}`,
);

// ------------------------------------------------------------------ step 12
console.log('\n== Step 12: print-ready export from the same renderer ==');
const exportRes = await fetch(`${BASE}/api/admin/orders/${textOnlyBody.publicId}/export`, {
  method: 'POST',
  headers: { cookie },
});
const exportBody = await json(exportRes);
check(
  'export renders a print file for the ordered line',
  exportRes.status === 200 && exportBody.outputs?.length >= 1,
  `outputs ${exportBody.outputs?.length}, dpi ${exportBody.dpi}`,
);
const output = exportBody.outputs?.[0];
const areaRow = db.prepare("select width, height from print_areas where product_id = ? and side = 'front'").get(productId);
const expectedWidth = Math.round(areaRow.width * (exportBody.dpi / 96));
check(
  'export resolution follows the print-area size at the chosen dpi',
  output && Math.abs(output.widthPx - expectedWidth) <= 2,
  `exported ${output?.widthPx}px vs expected ${expectedWidth}px`,
);
const download = await fetch(`${BASE}/api/admin/print-outputs/${output.id}`, { headers: { cookie } });
const png = Buffer.from(await download.arrayBuffer());
const isPng = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
check('the print file downloads as a real PNG', download.status === 200 && isPng, `${png.length} bytes`);

const anonDownload = await fetch(`${BASE}/api/admin/print-outputs/${output.id}`);
check('print files are not downloadable without staff sign-in', anonDownload.status === 401, `status ${anonDownload.status}`);

console.log('\n== Step 12: embroidery is flagged, never auto-digitized ==');
const embOrder = await json(
  await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orderType: 'B2C',
      customer,
      lines: [
        {
          productId,
          variantId,
          printMethod: 'EMBROIDERY',
          sizes: [{ size: 'L', qty: 2 }],
          designSides: { front: [textLayer], back: [] },
          designPublicId: null,
        },
      ],
    }),
  }),
);
const embExport = await json(
  await fetch(`${BASE}/api/admin/orders/${embOrder.publicId}/export`, {
    method: 'POST',
    headers: { cookie },
  }),
);
check(
  'an embroidery export is flagged for manual digitizing and keeps its intent',
  embExport.outputs?.[0]?.manualDigitizingRequired === true &&
    embExport.outputs?.[0]?.printMethod === 'EMBROIDERY' &&
    (embExport.embroideryIntents?.length ?? 0) === 1,
  `flag ${embExport.outputs?.[0]?.manualDigitizingRequired}, intents ${embExport.embroideryIntents?.length}`,
);
check(
  'the intent carries placement, size and colour but claims no stitch file',
  embExport.embroideryIntents?.[0]?.note === 'For manual digitizing. Not a stitch file.' &&
    Array.isArray(embExport.embroideryIntents?.[0]?.colours),
  `note "${embExport.embroideryIntents?.[0]?.note}"`,
);

// ------------------------------------------------------------------ step 14
console.log('\n== Step 14: status advance is persisted with a timestamp ==');
const advance = await fetch(`${BASE}/api/admin/orders/${b2b.publicId}/status`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ status: 'in_production', note: 'press started' }),
});
const advanceBody = await json(advance);
const history = db.prepare(
  'select h.status as status, h.staff_email as staff_email, h.created_at as created_at from order_status_history h join orders o on o.id = h.order_id where o.public_id = ? order by h.created_at asc',
).all(b2b.publicId);
check(
  'advancing status persists the new state and one timestamped history row per change',
  advanceBody.order?.status === 'in_production' && history.length === 2,
  `history: ${history.map((h) => h.status).join(' -> ')}`,
);
check('the history records which staff member changed it', history[1]?.staff_email === 'admin@sweetginger.local', history[1]?.staff_email);

db.close();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
