import fs from 'node:fs';
import path from 'node:path';

/** All local runtime state (SQLite file, uploaded artwork, generated files) lives here. */
export function getDataDir(): string {
  return process.env.STUDIO_DATA_DIR ?? path.join(process.cwd(), '.data');
}

/**
 * True on a host where the filesystem is ephemeral or read-only, so a local file
 * database cannot be the system of record. Vercel, Netlify and AWS Lambda all set one
 * of these.
 */
export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV,
  );
}

/** The exact instruction to show when the local backend is asked to run serverless. */
export const SERVERLESS_LOCAL_BACKEND_MESSAGE = [
  'This deployment is running the local SQLite backend (DATA_BACKEND=local), which needs a',
  'writable, persistent disk. On this host the disk is ephemeral and read-only, so no design,',
  'upload or order would survive — the app is refusing to pretend otherwise.',
  '',
  'To deploy it properly:',
  '  1. Create a Supabase project and run sweet-ginger-studio/supabase-setup.sql in its SQL editor.',
  '  2. In the host\u2019s environment variables set DATA_BACKEND=supabase plus',
  '     NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and a server-side',
  '     SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC_).',
  '  3. Redeploy — environment variables are read at build time, so a redeploy is required.',
].join('\n');

/**
 * Creates the local data directory, or explains the failure instead of surfacing a raw
 * ENOENT/EROFS from deep inside the database driver.
 */
export function ensureDataDir(): string {
  const dir = getDataDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (error) {
    throw new Error(
      `The local data folder "${dir}" could not be created or written to ` +
        `(${error instanceof Error ? error.message : String(error)}).\n\n` +
        (isServerlessRuntime()
          ? SERVERLESS_LOCAL_BACKEND_MESSAGE
          : 'Set STUDIO_DATA_DIR to a writable path, or use DATA_BACKEND=supabase.'),
    );
  }
  return dir;
}
