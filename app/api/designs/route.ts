import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRepo } from '@/lib/db';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'productId and variantId are required.' }, { status: 400 });
  }

  const repo = await getRepo();
  const product = await repo.getProduct(parsed.data.productId);
  if (!product) return NextResponse.json({ error: 'Unknown product.' }, { status: 404 });

  const variant = product.variants.find((v) => v.id === parsed.data.variantId);
  if (!variant) return NextResponse.json({ error: 'Unknown colour.' }, { status: 400 });

  const design = await repo.createDesign({ productId: product.id, variantId: variant.id });
  return NextResponse.json(design, { status: 201 });
}
