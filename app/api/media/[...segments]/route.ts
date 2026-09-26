import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '@/lib/paths';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/** Serves generated garment art, uploaded artwork and print files from the local data dir. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await context.params;
  const root = path.resolve(getDataDir());
  const resolved = path.resolve(path.join(root, ...segments));

  // Path-traversal guard: only files genuinely inside the data directory.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const type = TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream';
  return new NextResponse(new Uint8Array(fs.readFileSync(resolved)), {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=60' },
  });
}
