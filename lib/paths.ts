import fs from 'node:fs';
import path from 'node:path';
import { describeBackend, isServerlessRuntime, renderBackendMessage } from './diagnostics';

export { isServerlessRuntime } from './diagnostics';

/** All local runtime state (SQLite file, uploaded artwork, generated files) lives here. */
export function getDataDir(): string {
  return process.env.STUDIO_DATA_DIR ?? path.join(process.cwd(), '.data');
}

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
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The local data folder "${dir}" could not be created or written to (${cause}).\n\n` +
        (isServerlessRuntime()
          ? renderBackendMessage(describeBackend())
          : 'Set STUDIO_DATA_DIR to a writable path, or use DATA_BACKEND=supabase.'),
    );
  }
  return dir;
}
