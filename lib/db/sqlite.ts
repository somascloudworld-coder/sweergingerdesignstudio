import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDataDir, getDataDir } from '../paths';
import type {
  Design,
  DesignSides,
  Order,
  OrderLine,
  OrderStatus,
  PrintArea,
  PrintOutput,
  ProductWithDetails,
  ProductVariant,
  PriceTier,
  Side,
} from '../types';
import { SCHEMA_SQL } from './schema';
import { seedDatabase } from './seed';
import type {
  AssetRecord,
  CreateAssetInput,
  CreateDesignInput,
  CreateOrderInput,
  CreatePrintOutputInput,
  Repo,
  StaffUser,
} from './repo';

let dbHandle: Database.Database | null = null;
let ready: Promise<void> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function newPublicId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function getDb(): Database.Database {
  if (dbHandle) return dbHandle;
  const dataDir = ensureDataDir();
  const handle = new Database(path.join(dataDir, 'studio.db'));
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');
  handle.exec(SCHEMA_SQL);
  dbHandle = handle;
  return handle;
}

async function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      seedDatabase(getDb());
    })();
  }
  return ready;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  garment_type: string;
  base_price_paise: number;
  description: string;
  image_path: string;
}

interface VariantRow {
  id: string;
  product_id: string;
  colour_name: string;
  colour_hex: string;
  image_path: string;
  sort: number;
}

interface AreaRow {
  id: string;
  product_id: string;
  side: Side;
  x: number;
  y: number;
  width: number;
  height: number;
  units: 'px';
  provisional: number;
  note: string | null;
}

function mapVariant(row: VariantRow): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    colourName: row.colour_name,
    colourHex: row.colour_hex,
    imagePath: row.image_path,
    sort: row.sort,
  };
}

function mapArea(row: AreaRow): PrintArea {
  return {
    id: row.id,
    productId: row.product_id,
    side: row.side,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    units: 'px',
    provisional: row.provisional === 1,
    note: row.note ?? undefined,
  };
}

function parseSides(json: string): DesignSides {
  const parsed = JSON.parse(json) as Partial<DesignSides>;
  return { front: parsed.front ?? [], back: parsed.back ?? [] };
}

function mapPrintOutput(row: Record<string, unknown>): PrintOutput {
  return {
    id: row.id as string,
    orderItemId: row.order_item_id as string,
    side: row.side as Side,
    printMethod: row.print_method as PrintOutput['printMethod'],
    format: 'png',
    widthPx: row.width_px as number,
    heightPx: row.height_px as number,
    dpi: row.dpi as number,
    provisional: (row.provisional as number) === 1,
    manualDigitizingRequired: (row.manual_digitizing_required as number) === 1,
    createdAt: row.created_at as string,
  };
}

export async function createSqliteRepo(): Promise<Repo> {
  await ensureReady();
  const handle = getDb();

  function loadProduct(where: 'id' | 'slug', value: string): ProductWithDetails | null {
    const row = handle.prepare(`select * from products where ${where} = ?`).get(value) as
      | ProductRow
      | undefined;
    if (!row) return null;
    const variants = (
      handle
        .prepare('select * from product_variants where product_id = ? order by sort asc')
        .all(row.id) as VariantRow[]
    ).map(mapVariant);
    const areas = (
      handle
        .prepare('select * from print_areas where product_id = ? order by side asc')
        .all(row.id) as AreaRow[]
    ).map(mapArea);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      garmentType: row.garment_type,
      basePricePaise: row.base_price_paise,
      description: row.description,
      imagePath: row.image_path,
      variants,
      printAreas: areas,
    };
  }

  function loadOrder(row: Record<string, unknown>): Order {
    const orderId = row.id as string;
    const itemRows = handle
      .prepare('select * from order_items where order_id = ? order by rowid asc')
      .all(orderId) as Record<string, unknown>[];
    const lines: OrderLine[] = itemRows.map((item) => {
      const sizeRows = handle
        .prepare('select size, qty from order_item_sizes where order_item_id = ? order by rowid asc')
        .all(item.id as string) as { size: string; qty: number }[];
      return {
        id: item.id as string,
        orderId,
        productId: item.product_id as string,
        variantId: item.variant_id as string,
        colourName: item.colour_name as string,
        printMethod: item.print_method as OrderLine['printMethod'],
        sizes: sizeRows,
        designSides: parseSides(item.design_snapshot_json as string),
        designPublicId: (item.design_public_id as string | null) ?? null,
        unitPricePaise: item.unit_price_paise as number,
        quantity: item.quantity as number,
        lineTotalPaise: item.line_total_paise as number,
      };
    });

    return {
      id: orderId,
      publicId: row.public_id as string,
      orderType: row.order_type as Order['orderType'],
      customer: {
        name: row.customer_name as string,
        phone: row.customer_phone as string,
        email: row.customer_email as string,
        address: row.customer_address as string,
        company: (row.company as string | null) ?? undefined,
        gstin: (row.gstin as string | null) ?? undefined,
      },
      status: row.status as OrderStatus,
      paymentStatus: row.payment_status as Order['paymentStatus'],
      checkoutHandoff: row.checkout_handoff as string,
      subtotalPaise: row.subtotal_paise as number,
      totalPaise: row.total_paise as number,
      lines,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  function replaceDesignElements(designPublicId: string, sides: DesignSides): void {
    handle.prepare('delete from design_elements where design_public_id = ?').run(designPublicId);
    const insert = handle.prepare(
      `insert into design_elements
        (id, design_public_id, layer_id, element_type, side, z, x, y, width, height, scale_x, scale_y, angle, text_content, asset_id, font_family, font_size)
       values (@id, @designPublicId, @layerId, @elementType, @side, @z, @x, @y, @width, @height, @scaleX, @scaleY, @angle, @textContent, @assetId, @fontFamily, @fontSize)`,
    );
    for (const side of ['front', 'back'] as Side[]) {
      for (const layer of sides[side] ?? []) {
        insert.run({
          id: newId('el'),
          designPublicId,
          layerId: layer.id,
          elementType: layer.type,
          side,
          z: layer.z,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          scaleX: layer.scaleX,
          scaleY: layer.scaleY,
          angle: layer.angle,
          textContent: layer.type === 'text' ? layer.text : null,
          assetId: layer.type === 'image' ? layer.assetId : null,
          fontFamily: layer.type === 'text' ? layer.fontFamily : null,
          fontSize: layer.type === 'text' ? layer.fontSize : null,
        });
      }
    }
  }

  function getDesignImpl(publicIdValue: string): Design | null {
    const row = handle.prepare('select * from designs where public_id = ?').get(publicIdValue) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      publicId: row.public_id as string,
      productId: row.product_id as string,
      variantId: row.variant_id as string,
      sides: parseSides(row.sides_json as string),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  function getOrderImpl(publicIdValue: string): Order | null {
    const row = handle.prepare('select * from orders where public_id = ?').get(publicIdValue) as
      | Record<string, unknown>
      | undefined;
    return row ? loadOrder(row) : null;
  }

  const repo: Repo = {
    async listProducts() {
      const rows = handle.prepare('select * from products order by rowid asc').all() as ProductRow[];
      return rows.map((row) => loadProduct('id', row.id)).filter((p): p is ProductWithDetails => !!p);
    },

    async getProduct(idOrSlug) {
      return loadProduct('id', idOrSlug) ?? loadProduct('slug', idOrSlug);
    },

    async listPriceTiers(productId) {
      const rows = handle
        .prepare('select * from price_tiers where product_id = ? order by min_qty asc')
        .all(productId) as Record<string, unknown>[];
      return rows.map((r) => ({
        id: r.id as string,
        productId: r.product_id as string,
        variantId: (r.variant_id as string | null) ?? null,
        printMethod: (r.print_method as PriceTier['printMethod']) ?? null,
        minQty: r.min_qty as number,
        unitPricePaise: r.unit_price_paise as number,
        provisional: (r.provisional as number) === 1,
      }));
    },

    async createDesign(input: CreateDesignInput) {
      const stamp = nowIso();
      const record: Design = {
        publicId: newPublicId('d_'),
        productId: input.productId,
        variantId: input.variantId,
        sides: input.sides ?? { front: [], back: [] },
        createdAt: stamp,
        updatedAt: stamp,
      };
      handle
        .prepare(
          `insert into designs (public_id, product_id, variant_id, sides_json, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.publicId,
          record.productId,
          record.variantId,
          JSON.stringify(record.sides),
          stamp,
          stamp,
        );
      replaceDesignElements(record.publicId, record.sides);
      return record;
    },

    async getDesign(publicIdValue) {
      return getDesignImpl(publicIdValue);
    },

    async saveDesign(publicIdValue, sides, variantId) {
      const stamp = nowIso();
      const result = handle
        .prepare('update designs set sides_json = ?, variant_id = ?, updated_at = ? where public_id = ?')
        .run(JSON.stringify(sides), variantId, stamp, publicIdValue);
      if (result.changes === 0) throw new Error(`Design ${publicIdValue} not found`);
      replaceDesignElements(publicIdValue, sides);
      return getDesignImpl(publicIdValue)!;
    },

    async createAsset(input: CreateAssetInput) {
      const assetId = newId('asset');
      const ext = input.mime === 'image/png' ? '.png' : '.jpg';
      const dir = path.join(getDataDir(), 'assets');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${assetId}${ext}`);
      fs.writeFileSync(filePath, input.data);
      const record: AssetRecord = {
        id: assetId,
        designPublicId: input.designPublicId,
        originalName: input.originalName,
        mime: input.mime,
        filePath,
        width: input.width,
        height: input.height,
        bytes: input.bytes,
        createdAt: nowIso(),
      };
      handle
        .prepare(
          `insert into assets (id, design_public_id, original_name, mime, file_path, width, height, bytes, created_at)
           values (@id, @designPublicId, @originalName, @mime, @filePath, @width, @height, @bytes, @createdAt)`,
        )
        .run(record);
      return record;
    },

    async getAsset(assetId) {
      const row = handle.prepare('select * from assets where id = ?').get(assetId) as
        | Record<string, unknown>
        | undefined;
      if (!row) return null;
      return {
        id: row.id as string,
        designPublicId: (row.design_public_id as string | null) ?? null,
        originalName: row.original_name as string,
        mime: row.mime as string,
        filePath: row.file_path as string,
        width: row.width as number,
        height: row.height as number,
        bytes: row.bytes as number,
        createdAt: row.created_at as string,
      };
    },

    async readAssetData(asset) {
      return fs.readFileSync(asset.filePath);
    },

    async createOrder(input: CreateOrderInput) {
      const stamp = nowIso();
      const orderId = newId('order');
      const publicRef = newPublicId('o_');
      const create = handle.transaction(() => {
        handle
          .prepare(
            `insert into orders (id, public_id, order_type, customer_name, customer_phone, customer_email,
              customer_address, company, gstin, status, payment_status, checkout_handoff, subtotal_paise,
              total_paise, created_at, updated_at)
             values (@id, @publicId, @orderType, @name, @phone, @email, @address, @company, @gstin,
              'placed', 'placeholder_pending', @handoff, @subtotal, @total, @stamp, @stamp)`,
          )
          .run({
            id: orderId,
            publicId: publicRef,
            orderType: input.orderType,
            name: input.customer.name,
            phone: input.customer.phone,
            email: input.customer.email,
            address: input.customer.address,
            company: input.customer.company ?? null,
            gstin: input.customer.gstin ?? null,
            handoff: input.checkoutHandoff,
            subtotal: input.subtotalPaise,
            total: input.totalPaise,
            stamp,
          });

        const insertItem = handle.prepare(
          `insert into order_items (id, order_id, product_id, variant_id, colour_name, print_method,
            design_public_id, design_snapshot_json, unit_price_paise, quantity, line_total_paise)
           values (@id, @orderId, @productId, @variantId, @colourName, @printMethod, @designPublicId,
            @snapshot, @unitPrice, @quantity, @lineTotal)`,
        );
        const insertSize = handle.prepare(
          'insert into order_item_sizes (id, order_item_id, size, qty) values (?, ?, ?, ?)',
        );
        for (const line of input.lines) {
          const itemId = newId('item');
          insertItem.run({
            id: itemId,
            orderId,
            productId: line.productId,
            variantId: line.variantId,
            colourName: line.colourName,
            printMethod: line.printMethod,
            designPublicId: line.designPublicId,
            snapshot: JSON.stringify(line.designSides),
            unitPrice: line.unitPricePaise,
            quantity: line.quantity,
            lineTotal: line.lineTotalPaise,
          });
          for (const size of line.sizes) {
            insertSize.run(newId('size'), itemId, size.size, size.qty);
          }
        }

        handle
          .prepare(
            `insert into order_status_history (id, order_id, status, note, staff_email, created_at)
             values (?, ?, 'placed', ?, null, ?)`,
          )
          .run(newId('hist'), orderId, 'Order placed', stamp);
      });
      create();

      const row = handle.prepare('select * from orders where id = ?').get(orderId) as Record<
        string,
        unknown
      >;
      return loadOrder(row);
    },

    async listOrders() {
      const rows = handle
        .prepare('select * from orders order by created_at desc')
        .all() as Record<string, unknown>[];
      return rows.map(loadOrder);
    },

    async getOrder(publicIdValue) {
      return getOrderImpl(publicIdValue);
    },

    async advanceStatus(orderPublicId, status, note, staffEmail) {
      const stamp = nowIso();
      const result = handle
        .prepare('update orders set status = ?, updated_at = ? where public_id = ?')
        .run(status, stamp, orderPublicId);
      if (result.changes === 0) throw new Error(`Order ${orderPublicId} not found`);
      const row = handle
        .prepare('select id from orders where public_id = ?')
        .get(orderPublicId) as { id: string };
      handle
        .prepare(
          `insert into order_status_history (id, order_id, status, note, staff_email, created_at)
           values (?, ?, ?, ?, ?, ?)`,
        )
        .run(newId('hist'), row.id, status, note, staffEmail, stamp);
      return getOrderImpl(orderPublicId)!;
    },

    async writePrintOutputFile(key, data) {
      const segments = key.split('/').filter((part) => part && part !== '.' && part !== '..');
      const target = path.join(getDataDir(), ...segments);
      const root = path.resolve(getDataDir());
      if (!path.resolve(target).startsWith(root + path.sep)) {
        throw new Error(`Refusing to write a print file outside the data directory: ${key}`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      return target;
    },

    async addPrintOutput(input: CreatePrintOutputInput) {
      const output: PrintOutput = {
        id: newId('po'),
        orderItemId: input.orderItemId,
        side: input.side,
        printMethod: input.printMethod,
        format: input.format,
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        dpi: input.dpi,
        provisional: input.provisional,
        manualDigitizingRequired: input.manualDigitizingRequired,
        createdAt: nowIso(),
      };
      handle
        .prepare(
          `insert into print_outputs (id, order_item_id, side, print_method, format, width_px, height_px,
            dpi, provisional, manual_digitizing_required, file_path, created_at)
           values (@id, @orderItemId, @side, @printMethod, @format, @widthPx, @heightPx, @dpi, @provisional,
            @manual, @filePath, @createdAt)`,
        )
        .run({
          id: output.id,
          orderItemId: output.orderItemId,
          side: output.side,
          printMethod: output.printMethod,
          format: output.format,
          widthPx: output.widthPx,
          heightPx: output.heightPx,
          dpi: output.dpi,
          provisional: output.provisional ? 1 : 0,
          manual: output.manualDigitizingRequired ? 1 : 0,
          filePath: input.filePath,
          createdAt: output.createdAt,
        });
      return output;
    },

    async getPrintOutput(outputId) {
      const row = handle.prepare('select * from print_outputs where id = ?').get(outputId) as
        | Record<string, unknown>
        | undefined;
      return row ? mapPrintOutput(row) : null;
    },

    async listPrintOutputsForItem(orderItemId) {
      const rows = handle
        .prepare('select * from print_outputs where order_item_id = ? order by side asc')
        .all(orderItemId) as Record<string, unknown>[];
      return rows.map(mapPrintOutput);
    },

    async readPrintOutputData(outputId) {
      const row = handle
        .prepare('select file_path from print_outputs where id = ?')
        .get(outputId) as { file_path: string } | undefined;
      if (!row) return null;
      try {
        return fs.readFileSync(row.file_path);
      } catch {
        return null;
      }
    },

    async findStaff(email): Promise<StaffUser | null> {
      const row = handle
        .prepare('select * from admin_users where email = ?')
        .get(email.toLowerCase()) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: row.id as string,
        email: row.email as string,
        passwordHash: row.password_hash as string,
        role: row.role as string,
      };
    },
  };

  return repo;
}
