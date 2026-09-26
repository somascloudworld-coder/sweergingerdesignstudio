import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/db';
import { validateDesignSides } from '@/lib/geometry';
import { priceFor, sumSizeQuantities } from '@/lib/pricing';
import { createOrderSchema } from '@/lib/schemas';
import type { CreateOrderLineInput } from '@/lib/db/repo';
import type { PrintArea, Side } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Order creation. Three rules are enforced here, none of them trusted from the browser:
 *   1. "no order without artwork" - read broadly (PRD A7/C7): any layer counts,
 *      including a text-only design, but a completely empty design is rejected.
 *   2. every frozen design is re-validated against its print area.
 *   3. every price is recalculated from stored tiers.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'The order could not be read.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const repo = await getRepo();
  const prepared: CreateOrderLineInput[] = [];
  let subtotalPaise = 0;

  for (const [index, line] of parsed.data.lines.entries()) {
    const product = await repo.getProduct(line.productId);
    if (!product) return NextResponse.json({ error: `Unknown product ${line.productId}.` }, { status: 404 });
    const variant = product.variants.find((v) => v.id === line.variantId);
    if (!variant) return NextResponse.json({ error: `Unknown colour ${line.variantId}.` }, { status: 400 });

    // Rule 1: an order without artwork is not printable. Broad reading: any layer counts.
    const layerCount = line.designSides.front.length + line.designSides.back.length;
    if (layerCount === 0) {
      return NextResponse.json(
        {
          error: `Line ${index + 1} (${product.name}) has no design. Add text or artwork before ordering.`,
          code: 'NO_ARTWORK',
        },
        { status: 422 },
      );
    }

    // Rule 2: the frozen snapshot must still sit inside the print area.
    const areas: Partial<Record<Side, PrintArea>> = {};
    for (const area of product.printAreas) areas[area.side] = area;
    const validation = validateDesignSides(line.designSides, areas);
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: `Line ${index + 1} (${product.name}) has an element outside the print area.`,
          code: 'OUT_OF_BOUNDS',
          issues: validation.issues,
        },
        { status: 422 },
      );
    }

    const quantity = sumSizeQuantities(line.sizes);
    if (quantity < 1) {
      return NextResponse.json(
        { error: `Line ${index + 1} (${product.name}) has no quantity.` },
        { status: 400 },
      );
    }

    // Rule 3: price from stored tiers, never from anything the client sent.
    const tiers = await repo.listPriceTiers(product.id);
    const price = priceFor(tiers, {
      productId: product.id,
      variantId: variant.id,
      printMethod: line.printMethod,
      quantity,
      basePricePaise: product.basePricePaise,
    });

    subtotalPaise += price.subtotalPaise;
    prepared.push({
      productId: product.id,
      variantId: variant.id,
      colourName: variant.colourName,
      printMethod: line.printMethod,
      sizes: line.sizes,
      designSides: line.designSides,
      designPublicId: line.designPublicId ?? null,
      unitPricePaise: price.unitPricePaise,
      quantity,
      lineTotalPaise: price.subtotalPaise,
    });
  }

  const order = await repo.createOrder({
    orderType: parsed.data.orderType,
    customer: parsed.data.customer,
    // D6 unresolved: this is the flagged placeholder hand-off, not a real payment.
    checkoutHandoff: 'placeholder:hand-off to existing store checkout (D6 unresolved)',
    subtotalPaise,
    totalPaise: subtotalPaise,
    lines: prepared,
  });

  return NextResponse.json(
    { publicId: order.publicId, orderType: order.orderType, totalPaise: order.totalPaise, status: order.status },
    { status: 201 },
  );
}
