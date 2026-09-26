import path from 'node:path';

/** All local runtime state (SQLite file, uploaded artwork, generated files) lives here. */
export function getDataDir(): string {
  return process.env.STUDIO_DATA_DIR ?? path.join(process.cwd(), '.data');
}
