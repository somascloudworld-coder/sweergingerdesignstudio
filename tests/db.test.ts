import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A throwaway data directory so the tests never touch the dev database.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-studio-test-'));
process.env.STUDIO_DATA_DIR = tmp;
process.env.DATA_BACKEND = 'local';

import { createSqliteRepo } from '@/lib/db/sqlite';
import type { Repo } from '@/lib/db/repo';
import type { DesignSides, ImageLayer, TextLayer } from '@/lib/types';

let repo: Repo;

const layer: TextLayer = {
  id: 'l1',
  type: 'text',
  x: 150,
  y: 100,
  width: 120,
  height: 40,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  z: 1,
  text: 'Sweet Ginger',
  fontFamily: 'Arial',
  fontSize: 28,
  fill: '#111111',
  fontWeight: 'bold',
  fontStyle: 'normal',
  textAlign: 'center',
};

const img: ImageLayer = {
  id: 'l2',
  type: 'image',
  x: 150,
  y: 250,
  width: 80,
  height: 80,
  scaleX: 1,
  scaleY: 1,
  angle: 15,
  z: 2,
  assetId: 'asset_x',
  opacity: 1,
};

beforeAll(async () => {
  repo = await createSqliteRepo();
});

describe('seed', () => {
  it('seeds two T-shirt products with five colours and a front print area each', async () => {
    const products = await repo.listProducts();
    expect(products.map((p) => p.slug).sort()).toEqual(['classic-crew-tee', 'oversized-tee']);
    for (const product of products) {
      expect(product.variants).toHaveLength(5);
      expect(product.printAreas.map((a) => a.side)).toEqual(['front']);
      // Print areas are per product x side, and flagged provisional until D4 lands.
      expect(product.printAreas[0].provisional).toBe(true);
    }
  });

  it('does not seed polo, hoodies or caps (PRD A1)', async () => {
    const products = await repo.listProducts();
    expect(products.some((p) => /polo|hoodie|cap/i.test(p.name))).toBe(false);
  });

  it('has provisional price tiers that step down with quantity', async () => {
    const tiers = await repo.listPriceTiers('prod_classic-crew-tee');
    expect(tiers.map((t) => t.minQty)).toEqual([1, 10, 50]);
    expect(tiers[0].unitPricePaise).toBeGreaterThan(tiers[2].unitPricePaise);
  });
});

describe('designs are stored as structured layer JSON', () => {
  it('reloads the exact editable layers, not a flattened image', async () => {
    const product = (await repo.getProduct('classic-crew-tee'))!;
    const design = await repo.createDesign({
      productId: product.id,
      variantId: product.variants[0].id,
    });
    const sides: DesignSides = { front: [layer, img], back: [] };
    await repo.saveDesign(design.publicId, sides, product.variants[0].id);

    const reloaded = (await repo.getDesign(design.publicId))!;
    expect(reloaded.sides.front).toHaveLength(2);
    expect(reloaded.sides.front[0]).toMatchObject({ id: 'l1', type: 'text', text: 'Sweet Ginger' });
    expect(reloaded.sides.front[1]).toMatchObject({ id: 'l2', type: 'image', assetId: 'asset_x', angle: 15 });
    expect(reloaded.sides.back).toEqual([]);

    // The stored row is JSON text, not a binary image.
    const raw = fs.readFileSync(path.join(tmp, 'studio.db'));
    expect(raw.includes(Buffer.from('iVBORw0KGgo'))).toBe(false);
  });

  it('preserves the design when the colour changes (stored independently of the variant)', async () => {
    const product = (await repo.getProduct('classic-crew-tee'))!;
    const design = await repo.createDesign({ productId: product.id, variantId: product.variants[0].id });
    await repo.saveDesign(design.publicId, { front: [layer], back: [] }, product.variants[0].id);
    const before = (await repo.getDesign(design.publicId))!;

    // Colour swap = variant change only.
    await repo.saveDesign(design.publicId, before.sides, product.variants[2].id);
    const after = (await repo.getDesign(design.publicId))!;
    expect(JSON.stringify(after.sides)).toBe(JSON.stringify(before.sides));
    expect(after.variantId).toBe(product.variants[2].id);
  });
});

describe('orders keep one line shape for both order types', () => {
  it('writes B2C (one size) and B2B (a size grid) to the same table', async () => {
    const product = (await repo.getProduct('classic-crew-tee'))!;
    const sides: DesignSides = { front: [layer], back: [] };

    const b2c = await repo.createOrder({
      orderType: 'B2C',
      customer: { name: 'Asha', phone: '9849000001', email: 'a@example.com', address: 'Jaipur' },
      checkoutHandoff: 'placeholder:existing-store',
      subtotalPaise: 49900,
      totalPaise: 49900,
      lines: [
        {
          productId: product.id,
          variantId: product.variants[0].id,
          colourName: product.variants[0].colourName,
          printMethod: 'DTF',
          sizes: [{ size: 'M', qty: 1 }],
          designSides: sides,
          designPublicId: null,
          unitPricePaise: 49900,
          quantity: 1,
          lineTotalPaise: 49900,
        },
      ],
    });

    const b2b = await repo.createOrder({
      orderType: 'B2B',
      customer: { name: 'Ravi', phone: '9849000002', email: 'r@example.com', address: 'Jaipur', company: 'Acme' },
      checkoutHandoff: 'placeholder:existing-store',
      subtotalPaise: 42900 * 40,
      totalPaise: 42900 * 40,
      lines: [
        {
          productId: product.id,
          variantId: product.variants[1].id,
          colourName: product.variants[1].colourName,
          printMethod: 'DTF',
          sizes: [{ size: 'M', qty: 10 }, { size: 'L', qty: 25 }, { size: 'XL', qty: 5 }],
          designSides: sides,
          designPublicId: null,
          unitPricePaise: 42900,
          quantity: 40,
          lineTotalPaise: 42900 * 40,
        },
      ],
    });

    expect(b2c.lines[0].sizes).toEqual([{ size: 'M', qty: 1 }]);
    expect(b2b.lines[0].sizes).toHaveLength(3);
    expect(b2c.orderType).toBe('B2C');
    expect(b2b.orderType).toBe('B2B');
    // Both carry their own frozen design snapshot.
    expect(b2b.lines[0].designSides.front).toHaveLength(1);
    expect(b2b.status).toBe('placed');
    expect(b2b.paymentStatus).toBe('placeholder_pending');
  });

  it('keeps an order line frozen when the source design is edited afterwards', async () => {
    const product = (await repo.getProduct('oversized-tee'))!;
    const design = await repo.createDesign({ productId: product.id, variantId: product.variants[0].id });
    await repo.saveDesign(design.publicId, { front: [layer], back: [] }, product.variants[0].id);
    const snapshot = (await repo.getDesign(design.publicId))!;

    const order = await repo.createOrder({
      orderType: 'B2C',
      customer: { name: 'Kiran', phone: '9849000003', email: 'k@example.com', address: 'Jaipur' },
      checkoutHandoff: 'placeholder:existing-store',
      subtotalPaise: 59900,
      totalPaise: 59900,
      lines: [
        {
          productId: product.id,
          variantId: product.variants[0].id,
          colourName: product.variants[0].colourName,
          printMethod: 'DTF',
          sizes: [{ size: 'L', qty: 1 }],
          designSides: snapshot.sides,
          designPublicId: design.publicId,
          unitPricePaise: 59900,
          quantity: 1,
          lineTotalPaise: 59900,
        },
      ],
    });

    // Edit the live design after the order exists.
    await repo.saveDesign(design.publicId, { front: [layer, img], back: [] }, product.variants[0].id);

    const reread = (await repo.getOrder(order.publicId))!;
    expect(reread.lines[0].designSides.front).toHaveLength(1);
  });
});

describe('status workflow', () => {
  it('advances status and records a timestamped history event', async () => {
    const orders = await repo.listOrders();
    const target = orders[0];
    const advanced = await repo.advanceStatus(target.publicId, 'in_production', 'started', 'admin@sweetginger.local');
    expect(advanced.status).toBe('in_production');
    expect(new Date(advanced.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(target.updatedAt).getTime());
  });
});

describe('print outputs', () => {
  it('stores an export record linked to the order item and print method', async () => {
    const orders = await repo.listOrders();
    const item = orders[0].lines[0];
    const output = await repo.addPrintOutput({
      orderItemId: item.id,
      side: 'front',
      printMethod: 'EMBROIDERY',
      format: 'png',
      widthPx: 1200,
      heightPx: 1520,
      dpi: 300,
      provisional: true,
      manualDigitizingRequired: true,
      filePath: path.join(tmp, 'print', 'front.png'),
    });
    expect(output.manualDigitizingRequired).toBe(true);
    const list = await repo.listPrintOutputsForItem(item.id);
    expect(list).toHaveLength(1);
  });
});

describe('staff lookup', () => {
  it('finds the seeded admin and verifies the password', async () => {
    const staff = await repo.findStaff('admin@sweetginger.local');
    expect(staff).not.toBeNull();
    const { verifyPassword } = await import('@/lib/staff');
    expect(verifyPassword('sweetginger', staff!.passwordHash)).toBe(true);
    expect(verifyPassword('wrong', staff!.passwordHash)).toBe(false);
  });
});
