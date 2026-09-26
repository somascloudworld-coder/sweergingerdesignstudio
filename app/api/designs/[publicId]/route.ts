import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/db';
import { validateDesignSides } from '@/lib/geometry';
import { saveDesignSchema } from '@/lib/schemas';
import type { PrintArea, Side } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ publicId: string }> };

export async function GET(_request: Request, context: Context) {
  const { publicId } = await context.params;
  const repo = await getRepo();
  const design = await repo.getDesign(publicId);
  if (!design) return NextResponse.json({ error: 'Design not found.' }, { status: 404 });
  return NextResponse.json(design);
}

/**
 * Authoritative save. The client clamp is UX only; this is what actually protects the
 * print floor (IMPLEMENTATION-PLAN step 4). An out-of-bounds design is rejected and
 * nothing is written.
 */
export async function PUT(request: Request, context: Context) {
  const { publicId } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = saveDesignSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'The design could not be read.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const repo = await getRepo();
  const design = await repo.getDesign(publicId);
  if (!design) return NextResponse.json({ error: 'Design not found.' }, { status: 404 });

  const product = await repo.getProduct(design.productId);
  if (!product) return NextResponse.json({ error: 'Unknown product.' }, { status: 404 });

  const areas: Partial<Record<Side, PrintArea>> = {};
  for (const area of product.printAreas) areas[area.side] = area;

  const validation = validateDesignSides(parsed.data.sides, areas);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: 'Every element must stay inside the print area.',
        issues: validation.issues,
        corrected: validation.corrected,
      },
      { status: 422 },
    );
  }

  const saved = await repo.saveDesign(publicId, parsed.data.sides, parsed.data.variantId);
  return NextResponse.json(saved);
}
