import { NextResponse } from 'next/server';
import { STAFF_COOKIE } from '@/lib/staff';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(STAFF_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
