import type { Database } from 'better-sqlite3';
import { SEED_COLOURS, SEED_PRODUCTS, SEED_TIERS, garmentImagePath } from '../catalog';
import { hashPassword } from '../staff';

export { GARMENT_HEIGHT, GARMENT_SIZES, GARMENT_WIDTH, SEED_COLOURS, SEED_PRODUCTS, SEED_TIERS } from '../catalog';

// Garment art is generated into public/garments/ by scripts/build-garments.mjs (run
// automatically before `dev` and `build`), so no seeding code needs to touch the disk.

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
        imagePath: garmentImagePath(product.slug, SEED_COLOURS[0].name),
      });

      SEED_COLOURS.forEach((colour, index) => {
        insertVariant.run({
          id: `${product.slug}--${colour.name.toLowerCase().replace(/\s+/g, '-')}`,
          productId,
          colourName: colour.name,
          colourHex: colour.hex,
          imagePath: garmentImagePath(product.slug, colour.name),
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
