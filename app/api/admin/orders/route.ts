import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/db';
import { currentStaff } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const staff = await currentStaff();
  if (!staff) return NextResponse.json({ error: 'Staff sign-in required.' }, { status: 401 });

  const repo = await getRepo();
  const orders = await repo.listOrders();
  return NextResponse.json({ orders });
}
