import { cookies } from 'next/headers';
import { STAFF_COOKIE, readStaffToken, type StaffSession } from '../staff';

/** Returns the signed-in staff session, or null. Never trusts a client-sent role. */
export async function currentStaff(): Promise<StaffSession | null> {
  const store = await cookies();
  return readStaffToken(store.get(STAFF_COOKIE)?.value);
}
