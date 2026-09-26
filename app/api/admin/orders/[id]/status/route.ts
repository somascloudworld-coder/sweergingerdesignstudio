import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/db';
import { statusAdvanceSchema } from '@/lib/schemas';
import { currentStaff } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const staff = await currentStaff();
  if (!staff) return NextResponse.json({ error: 'Staff sign-in required.' }, { status: 401 });

  const { id } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = statusAdvanceSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid status is required.' }, { status: 400 });
  }

  const repo = await getRepo();
  const order = await repo.getOrder(id);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const updated = await repo.advanceStatus(
    id,
    parsed.data.status,
    parsed.data.note ?? null,
    staff.email,
  );
  return NextResponse.json({ order: updated });
}
