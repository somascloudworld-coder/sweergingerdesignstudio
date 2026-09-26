import type { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  GARMENT_HEIGHT,
  GARMENT_WIDTH,
  SEED_COLOURS,
  SEED_PRODUCTS,
  SEED_TIERS,
  variantIdFor,
  type SeedColour,
  type SeedProduct,
} from '../catalog';
import { hashPassword } from '../staff';

export {
  GARMENT_HEIGHT,
  GARMENT_SIZES,
  GARMENT_WIDTH,
  SEED_COLOURS,
  SEED_PRODUCTS,
  SEED_TIERS,
} from '../catalog';

/**
 * PLACEHOLDER GARMENT ART.
 *
 * Step 2 of the plan requires real photographed garments. None were supplied, so these
 * are generated silhouettes, clearly labelled as placeholders in the image itself.
 * Replace with real photography before the owner acceptance step (step 16).
 */
function garmentSvg(colour: SeedColour, product: SeedProduct): string {
  const label = `${product.name} · ${colour.name} (placeholder garment art)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GARMENT_WIDTH}" height="${GARMENT_HEIGHT}" viewBox="0 0 ${GARMENT_WIDTH} ${GARMENT_HEIGHT}">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.24"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.20"/>
    </linearGradient>
    <linearGradient id="fold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.00"/>
      <stop offset="50%" stop-color="#000000" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.00"/>
    </linearGradient>
  </defs>
  <rect width="${GARMENT_WIDTH}" height="${GARMENT_HEIGHT}" fill="#eef0f2"/>
  <path d="M232 78 L306 58 Q320 96 334 58 L408 78 L548 168 L486 268 L438 234 L438 726 Q320 752 202 726 L202 234 L154 268 L92 168 Z"
        fill="${colour.hex}" stroke="#00000055" stroke-width="2"/>
  <path d="M232 78 L306 58 Q320 96 334 58 L408 78 L548 168 L486 268 L438 234 L438 726 Q320 752 202 726 L202 234 L154 268 L92 168 Z"
        fill="url(#shade)"/>
  <path d="M286 60 Q320 118 354 60 Q338 74 320 74 Q302 74 286 60 Z" fill="#00000033"/>
  <rect x="150" y="180" width="140" height="500" fill="url(#fold)"/>
  <rect x="350" y="180" width="140" height="500" fill="url(#fold)"/>
  <text x="320" y="784" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#5b6470" text-anchor="middle">${label}</text>
</svg>`;
}

export async function ensureGarmentImages(dataDir: string): Promise<void> {
  const dir = path.join(dataDir, 'garments');
  fs.mkdirSync(dir, { recursive: true });
  for (const product of SEED_PRODUCTS) {
    for (const colour of SEED_COLOURS) {
      const file = path.join(dir, `${variantIdFor(product.slug, colour.name)}.png`);
      if (fs.existsSync(file)) continue;
      await sharp(Buffer.from(garmentSvg(colour, product))).png().toFile(file);
    }
  }
}

export function isSeeded(db: Database): boolean {
  const row = db.prepare('select count(*) as count from products').get() as { count: number };
  return row.count > 0;
}

export function seedDatabase(db: Database): void {
  if (isSeeded(db)) return;
  const now = new Date().toISOString();

  const insertProduct = db.prepare(
    `insert into products (id, slug, name, garment_type, base_price_paise, description, image_path)
     values (@id, @slug, @name, @garmentType, @basePricePaise, @description, @imagePath)`,
  );
  const insertVariant = db.prepare(
    `insert into product_variants (id, product_id, colour_name, colour_hex, image_path, sort)
     values (@id, @productId, @colourName, @colourHex, @imagePath, @sort)`,
  );
  const insertArea = db.prepare(
    `insert into print_areas (id, product_id, side, x, y, width, height, units, provisional, note)
     values (@id, @productId, @side, @x, @y, @width, @height, 'px', 1, @note)`,
  );
  const insertTier = db.prepare(
    `insert into price_tiers (id, product_id, variant_id, print_method, min_qty, unit_price_paise, provisional)
     values (@id, @productId, null, null, @minQty, @unitPricePaise, 1)`,
  );
  const insertAdmin = db.prepare(
    `insert into admin_users (id, email, password_hash, role, created_at)
     values (@id, @email, @passwordHash, 'admin', @createdAt)`,
  );

  const seed = db.transaction(() => {
    for (const product of SEED_PRODUCTS) {
      const productId = `prod_${product.slug}`;
      insertProduct.run({
        id: productId,
        slug: product.slug,
        name: product.name,
        garmentType: product.garmentType,
        basePricePaise: product.basePricePaise,
        description: product.description,
        imagePath: `/api/media/garments/${variantIdFor(product.slug, SEED_COLOURS[0].name)}.png`,
      });

      SEED_COLOURS.forEach((colour, index) => {
        const variantId = variantIdFor(product.slug, colour.name);
        insertVariant.run({
          id: variantId,
          productId,
          colourName: colour.name,
          colourHex: colour.hex,
          imagePath: `/api/media/garments/${variantId}.png`,
          sort: index,
        });
      });

      insertArea.run({
        id: `area_${product.slug}_front`,
        productId,
        side: 'front',
        x: product.front.x,
        y: product.front.y,
        width: product.front.width,
        height: product.front.height,
        note: 'PROVISIONAL placeholder print area - replace with Ginger Prints dimensions (D4/C10).',
      });

      for (const tier of SEED_TIERS.filter((t) => t.slug === product.slug)) {
        insertTier.run({
          id: `tier_${product.slug}_${tier.minQty}`,
          productId,
          minQty: tier.minQty,
          unitPricePaise: tier.unitPricePaise,
        });
      }
    }

    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@sweetginger.local';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'sweetginger';
    insertAdmin.run({
      id: 'staff_admin',
      email: adminEmail.toLowerCase(),
      passwordHash: hashPassword(adminPassword),
      createdAt: now,
    });
  });

  seed();
}
