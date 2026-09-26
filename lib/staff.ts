import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface StaffSession {
  email: string;
  role: string;
  exp: number;
}

export const STAFF_COOKIE = 'sg_staff';

/**
 * A stable signing secret. Uses STAFF_SESSION_SECRET when set; otherwise a random
 * secret persisted to .data so a dev restart does not invalidate sessions. This
 * secret never reaches the browser.
 */
export function sessionSecret(): Buffer {
  const fromEnv = process.env.STAFF_SESSION_SECRET;
  if (fromEnv && fromEnv.trim()) return Buffer.from(fromEnv.trim(), 'utf8');

  const dataDir = path.join(process.cwd(), '.data');
  const secretFile = path.join(dataDir, 'session-secret');
  try {
    if (fs.existsSync(secretFile)) return Buffer.from(fs.readFileSync(secretFile, 'utf8'), 'utf8');
    fs.mkdirSync(dataDir, { recursive: true });
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, generated, 'utf8');
    return Buffer.from(generated, 'utf8');
  } catch {
    // Read-only filesystem: fall back to an in-process secret.
    return crypto.createHash('sha256').update('sweet-ginger-dev-secret').digest();
  }
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createStaffToken(email: string, role: string, ttlMs = 8 * 60 * 60 * 1000): string {
  const payload: StaffSession = { email, role, exp: Date.now() + ttlMs };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function readStaffToken(token: string | undefined | null): StaffSession | null {
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as StaffSession;
    if (typeof session.exp !== 'number' || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}
