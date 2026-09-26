import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import type {
  Design,
  DesignSides,
  Order,
  OrderLine,
  OrderStatus,
  PrintArea,
  PrintOutput,
  PriceTier,
  ProductWithDetails,
  ProductVariant,
  Side,
} from '../types';
import type {
  AssetRecord,
  CreateAssetInput,
  CreateDesignInput,
  CreateOrderInput,
  CreatePrintOutputInput,
  Repo,
  StaffUser,
} from './repo';

const BUCKET = 'studio';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function newPublicId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function parseSides(json: unknown): DesignSides {
  const value = (typeof json === 'string' ? JSON.parse(json) : json) as Partial<DesignSides> | null;
  return { front: value?.front ?? [], back: value?.back ?? [] };
}

/**
 * Supabase-backed repository. This is the production path in TECH-STACK.md section 2.
 * It is selected with DATA_BACKEND=supabase and requires the service-role key, which
 * is read server-side only and never exposed to the browser.
 *
 * NOTE: UNVERIFIED on this machine - no Supabase project was provisioned for this
 * build. supabase-setup.sql creates the matching schema and bucket.
 */
export function createSupabaseRepo(): Repo {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase backend selected but NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not both set.',
    );
  }
  const client: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
    if (result.error) throw new Error(result.error.message);
    if (result.data === null) throw new Error('Supabase returned no data.');
    return result.data;
  }

  async function loadProduct(row: Record<string, unknown>): Promise<ProductWithDetails> {
    const productId = row.id as string;
    const variants = unwrap(
      await client
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('sort', { ascending: true }),
    ) as Record<string, unknown>[];
    const areas = unwrap(
      await client.from('print_areas').select('*').eq('product_id', productId),
    ) as Record<string, unknown>[];

    return {
      id: productId,
      slug: row.slug as string,
      name: row.name as string,
      garmentType: row.garment_type as string,
      basePricePaise: row.base_price_paise as number,
      description: (row.description as string) ?? '',
      imagePath: (row.image_path as string) ?? '',
      variants: variants.map(
        (v): ProductVariant => ({
          id: v.id as string,
          productId,
          colourName: v.colour_name as string,
          colourHex: v.colour_hex as string,
          imagePath: (v.image_path as string) ?? '',
          sort: (v.sort as number) ?? 0,
        }),
      ),
      printAreas: areas.map(
        (a): PrintArea => ({
          id: a.id as string,
          productId,
          side: a.side as Side,
          x: a.x as number,
          y: a.y as number,
          width: a.width as number,
          height: a.height as number,
          units: 'px',
          provisional: Boolean(a.provisional),
          note: (a.note as string | null) ?? undefined,
        }),
      ),
    };
  }

  async function loadOrder(row: Record<string, unknown>): Promise<Order> {
    const orderId = row.id as string;
    const items = unwrap(
      await client.from('order_items').select('*').eq('order_id', orderId),
    ) as Record<string, unknown>[];
    const sizes = unwrap(
      await client
        .from('order_item_sizes')
        .select('*')
        .in('order_item_id', items.map((i) => i.id as string)),
    ) as Record<string, unknown>[];

    const lines: OrderLine[] = items.map((item) => ({
      id: item.id as string,
      orderId,
      productId: item.product_id as string,
      variantId: item.variant_id as string,
      colourName: item.colour_name as string,
      printMethod: item.print_method as OrderLine['printMethod'],
      sizes: sizes
        .filter((s) => s.order_item_id === item.id)
        .map((s) => ({ size: s.size as string, qty: s.qty as number })),
      designSides: parseSides(item.design_snapshot_json),
      designPublicId: (item.design_public_id as string | null) ?? null,
      unitPricePaise: item.unit_price_paise as number,
      quantity: item.quantity as number,
      lineTotalPaise: item.line_total_paise as number,
    }));

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

  async function uploadAsset(pathKey: string, data: Buffer, mime: string): Promise<void> {
    const { error } = await client.storage.from(BUCKET).upload(pathKey, data, {
      contentType: mime,
      upsert: true,
    });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return {
    async listProducts() {
      const rows = unwrap(await client.from('products').select('*')) as Record<string, unknown>[];
      return Promise.all(rows.map(loadProduct));
    },

    async getProduct(idOrSlug) {
      const byId = await client.from('products').select('*').eq('id', idOrSlug).maybeSingle();
      if (byId.data) return loadProduct(byId.data as Record<string, unknown>);
      const bySlug = await client.from('products').select('*').eq('slug', idOrSlug).maybeSingle();
      return bySlug.data ? loadProduct(bySlug.data as Record<string, unknown>) : null;
    },

    async listPriceTiers(productId) {
      const rows = unwrap(
        await client.from('price_tiers').select('*').eq('product_id', productId).order('min_qty'),
      ) as Record<string, unknown>[];
      return rows.map(
        (r): PriceTier => ({
          id: r.id as string,
          productId: r.product_id as string,
          variantId: (r.variant_id as string | null) ?? null,
          printMethod: (r.print_method as PriceTier['printMethod']) ?? null,
          minQty: r.min_qty as number,
          unitPricePaise: r.unit_price_paise as number,
          provisional: Boolean(r.provisional),
        }),
      );
    },

    async createDesign(input: CreateDesignInput) {
      const stamp = nowIso();
      const row = {
        public_id: newPublicId('d_'),
        product_id: input.productId,
        variant_id: input.variantId,
        sides_json: input.sides ?? { front: [], back: [] },
        created_at: stamp,
        updated_at: stamp,
      };
      unwrap(await client.from('designs').insert(row).select().single());
      await replaceElements(client, row.public_id, row.sides_json as DesignSides);
      return {
        publicId: row.public_id,
        productId: row.product_id,
        variantId: row.variant_id,
        sides: row.sides_json as DesignSides,
        createdAt: stamp,
        updatedAt: stamp,
      };
    },

    async getDesign(publicIdValue) {
      const result = await client
        .from('designs')
        .select('*')
        .eq('public_id', publicIdValue)
        .maybeSingle();
      if (!result.data) return null;
      const row = result.data as Record<string, unknown>;
      return {
        publicId: row.public_id as string,
        productId: row.product_id as string,
        variantId: row.variant_id as string,
        sides: parseSides(row.sides_json),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      };
    },

    async saveDesign(publicIdValue, sides, variantId) {
      const stamp = nowIso();
      const result = await client
        .from('designs')
        .update({ sides_json: sides, variant_id: variantId, updated_at: stamp })
        .eq('public_id', publicIdValue)
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      await replaceElements(client, publicIdValue, sides);
      return {
        publicId: publicIdValue,
        productId: (result.data.product_id as string) ?? '',
        variantId,
        sides,
        createdAt: result.data.created_at as string,
        updatedAt: stamp,
      };
    },

    async createAsset(input: CreateAssetInput) {
      const assetId = newId('asset');
      const ext = input.mime === 'image/png' ? '.png' : '.jpg';
      const key = `designs/${input.designPublicId ?? 'unattached'}/source/${assetId}${ext}`;
      await uploadAsset(key, input.data, input.mime);
      const record: AssetRecord = {
        id: assetId,
        designPublicId: input.designPublicId,
        originalName: input.originalName,
        mime: input.mime,
        filePath: key,
        width: input.width,
        height: input.height,
        bytes: input.bytes,
        createdAt: nowIso(),
      };
      unwrap(await client.from('assets').insert(record).select().single());
      return record;
    },

    async getAsset(assetId) {
      const result = await client.from('assets').select('*').eq('id', assetId).maybeSingle();
      if (!result.data) return null;
      const row = result.data as Record<string, unknown>;
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
      const { data, error } = await client.storage.from(BUCKET).download(asset.filePath);
      if (error || !data) throw new Error(`Supabase Storage download failed: ${error?.message}`);
      return Buffer.from(await data.arrayBuffer());
    },

    async createOrder(input: CreateOrderInput) {
      const stamp = nowIso();
      const orderPublicId = newPublicId('o_');
      const orderRow = {
        public_id: orderPublicId,
        order_type: input.orderType,
        customer_name: input.customer.name,
        customer_phone: input.customer.phone,
        customer_email: input.customer.email,
        customer_address: input.customer.address,
        company: input.customer.company ?? null,
        gstin: input.customer.gstin ?? null,
        status: 'placed',
        payment_status: 'placeholder_pending',
        checkout_handoff: input.checkoutHandoff,
        subtotal_paise: input.subtotalPaise,
        total_paise: input.totalPaise,
        created_at: stamp,
        updated_at: stamp,
      };
      const inserted = unwrap(
        await client.from('orders').insert(orderRow).select().single(),
      ) as Record<string, unknown>;
      const orderId = inserted.id as string;

      for (const line of input.lines) {
        const item = unwrap(
          await client
            .from('order_items')
            .insert({
              order_id: orderId,
              product_id: line.productId,
              variant_id: line.variantId,
              colour_name: line.colourName,
              print_method: line.printMethod,
              design_public_id: line.designPublicId,
              design_snapshot_json: line.designSides,
              unit_price_paise: line.unitPricePaise,
              quantity: line.quantity,
              line_total_paise: line.lineTotalPaise,
            })
            .select()
            .single(),
        ) as Record<string, unknown>;
        if (line.sizes.length > 0) {
          const { error } = await client
            .from('order_item_sizes')
            .insert(line.sizes.map((s) => ({ order_item_id: item.id, size: s.size, qty: s.qty })));
          if (error) throw new Error(error.message);
        }
      }

      await client
        .from('order_status_history')
        .insert({ order_id: orderId, status: 'placed', note: 'Order placed', created_at: stamp });

      return loadOrder(inserted);
    },

    async listOrders() {
      const rows = unwrap(
        await client.from('orders').select('*').order('created_at', { ascending: false }),
      ) as Record<string, unknown>[];
      return Promise.all(rows.map(loadOrder));
    },

    async getOrder(publicIdValue) {
      const result = await client
        .from('orders')
        .select('*')
        .eq('public_id', publicIdValue)
        .maybeSingle();
      return result.data ? loadOrder(result.data as Record<string, unknown>) : null;
    },

    async advanceStatus(orderPublicId, status, note, staffEmail) {
      const stamp = nowIso();
      const updated = unwrap(
        await client
          .from('orders')
          .update({ status, updated_at: stamp })
          .eq('public_id', orderPublicId)
          .select()
          .single(),
      ) as Record<string, unknown>;
      await client.from('order_status_history').insert({
        order_id: updated.id,
        status,
        note,
        staff_email: staffEmail,
        created_at: stamp,
      });
      return loadOrder(updated);
    },

    async writePrintOutputFile(key, data, mime) {
      await uploadAsset(key, data, mime);
      return key;
    },

    async addPrintOutput(input: CreatePrintOutputInput) {
      const row = {
        id: newId('po'),
        order_item_id: input.orderItemId,
        side: input.side,
        print_method: input.printMethod,
        format: input.format,
        width_px: input.widthPx,
        height_px: input.heightPx,
        dpi: input.dpi,
        provisional: input.provisional,
        manual_digitizing_required: input.manualDigitizingRequired,
        file_path: input.filePath,
        created_at: nowIso(),
      };
      unwrap(await client.from('print_outputs').insert(row).select().single());
      return {
        id: row.id,
        orderItemId: row.order_item_id,
        side: row.side,
        printMethod: row.print_method,
        format: 'png',
        widthPx: row.width_px,
        heightPx: row.height_px,
        dpi: row.dpi,
        provisional: row.provisional,
        manualDigitizingRequired: row.manual_digitizing_required,
        createdAt: row.created_at,
      };
    },

    async getPrintOutput(outputId) {
      const result = await client
        .from('print_outputs')
        .select('*')
        .eq('id', outputId)
        .maybeSingle();
      if (!result.data) return null;
      const r = result.data as Record<string, unknown>;
      return {
        id: r.id as string,
        orderItemId: r.order_item_id as string,
        side: r.side as Side,
        printMethod: r.print_method as PrintOutput['printMethod'],
        format: 'png',
        widthPx: r.width_px as number,
        heightPx: r.height_px as number,
        dpi: r.dpi as number,
        provisional: Boolean(r.provisional),
        manualDigitizingRequired: Boolean(r.manual_digitizing_required),
        createdAt: r.created_at as string,
      };
    },

    async listPrintOutputsForItem(orderItemId) {
      const rows = unwrap(
        await client.from('print_outputs').select('*').eq('order_item_id', orderItemId),
      ) as Record<string, unknown>[];
      return rows.map((r) => ({
        id: r.id as string,
        orderItemId: r.order_item_id as string,
        side: r.side as Side,
        printMethod: r.print_method as PrintOutput['printMethod'],
        format: 'png' as const,
        widthPx: r.width_px as number,
        heightPx: r.height_px as number,
        dpi: r.dpi as number,
        provisional: Boolean(r.provisional),
        manualDigitizingRequired: Boolean(r.manual_digitizing_required),
        createdAt: r.created_at as string,
      }));
    },

    async readPrintOutputData(outputId) {
      const result = await client
        .from('print_outputs')
        .select('file_path')
        .eq('id', outputId)
        .maybeSingle();
      if (!result.data) return null;
      const { data, error } = await client.storage
        .from(BUCKET)
        .download((result.data as { file_path: string }).file_path);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },

    async findStaff(email): Promise<StaffUser | null> {
      const result = await client
        .from('admin_users')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      if (!result.data) return null;
      const row = result.data as Record<string, unknown>;
      return {
        id: row.id as string,
        email: row.email as string,
        passwordHash: row.password_hash as string,
        role: (row.role as string) ?? 'admin',
      };
    },
  };
}

async function replaceElements(
  client: SupabaseClient,
  designPublicId: string,
  sides: DesignSides,
): Promise<void> {
  await client.from('design_elements').delete().eq('design_public_id', designPublicId);
  const rows: Record<string, unknown>[] = [];
  for (const side of ['front', 'back'] as Side[]) {
    for (const layer of sides[side] ?? []) {
      rows.push({
        design_public_id: designPublicId,
        layer_id: layer.id,
        element_type: layer.type,
        side,
        z: layer.z,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        scale_x: layer.scaleX,
        scale_y: layer.scaleY,
        angle: layer.angle,
        text_content: layer.type === 'text' ? layer.text : null,
        asset_id: layer.type === 'image' ? layer.assetId : null,
        font_family: layer.type === 'text' ? layer.fontFamily : null,
        font_size: layer.type === 'text' ? layer.fontSize : null,
      });
    }
  }
  if (rows.length > 0) await client.from('design_elements').insert(rows);
}
