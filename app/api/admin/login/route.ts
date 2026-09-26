import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/db';
import { staffLoginSchema } from '@/lib/schemas';
import { STAFF_COOKIE, createStaffToken, verifyPassword } from '@/lib/staff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = staffLoginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const repo = await getRepo();
  const staff = await repo.findStaff(parsed.data.email);
  // Same response whether the email exists or the password is wrong.
  if (!staff || !verifyPassword(parsed.data.password, staff.passwordHash)) {
    return NextResponse.json({ error: 'Those details do not match a staff account.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, email: staff.email, role: staff.role });
  response.cookies.set(STAFF_COOKIE, createStaffToken(staff.email, staff.role), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  return response;
}
