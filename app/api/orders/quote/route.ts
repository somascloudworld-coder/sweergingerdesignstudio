import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/db';
import { priceFor, sumSizeQuantities } from '@/lib/pricing';
import { quoteSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/** The server prices every line from its own stored tiers. Client prices are ignored. */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = quoteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'The quote request could not be read.' }, { status: 400 });
  }

  const repo = await getRepo();
  const lines: Record<string, unknown>[] = [];

  for (const line of parsed.data.lines) {
    const product = await repo.getProduct(line.productId);
    if (!product) return NextResponse.json({ error: `Unknown product ${line.productId}.` }, { status: 404 });
    const variant = product.variants.find((v) => v.id === line.variantId);
    if (!variant) return NextResponse.json({ error: `Unknown colour ${line.variantId}.` }, { status: 400 });

    const quantity = sumSizeQuantities(line.sizes);
    if (quantity < 1) {
      return NextResponse.json(
        { error: `Line for ${product.name} has no quantity.` },
        { status: 400 },
      );
    }

    const tiers = await repo.listPriceTiers(product.id);
    const price = priceFor(tiers, {
      productId: product.id,
      variantId: variant.id,
      printMethod: line.printMethod,
      quantity,
      basePricePaise: product.basePricePaise,
    });

    lines.push({
      lineId: line.lineId ?? null,
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      colourName: variant.colourName,
      printMethod: line.printMethod,
      quantity,
      unitPricePaise: price.unitPricePaise,
      lineTotalPaise: price.subtotalPaise,
      tierId: price.tierId,
      provisional: price.provisional,
    });
  }

  const subtotalPaise = lines.reduce((sum, l) => sum + (l.lineTotalPaise as number), 0);
  return NextResponse.json({
    lines,
    subtotalPaise,
    totalPaise: subtotalPaise,
    anyProvisional: lines.some((l) => l.provisional),
  });
}
