import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getRepo } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['png', 'jpeg', 'jpg', 'webp']);

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Artwork must be 8 MB or smaller.' }, { status: 413 });
  }

  const designPublicId = form.get('designPublicId');
  const buffer = Buffer.from(await file.arrayBuffer());

  // Decode rather than trust the extension or the browser-supplied MIME type.
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    return NextResponse.json({ error: 'That file is not a readable image.' }, { status: 400 });
  }

  if (!metadata.format || !ALLOWED.has(metadata.format)) {
    return NextResponse.json({ error: 'Use a PNG, JPG or WebP image.' }, { status: 400 });
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 20 || height < 20) {
    return NextResponse.json({ error: 'Artwork must be at least 20 x 20 pixels.' }, { status: 400 });
  }
  if (width > 8000 || height > 8000) {
    return NextResponse.json({ error: 'Artwork must be 8000 px or smaller per side.' }, { status: 400 });
  }

  // Normalise: bake rotation, drop metadata, re-encode as PNG.
  const normalized = await sharp(buffer).rotate().png().toBuffer();

  const repo = await getRepo();
  const asset = await repo.createAsset({
    designPublicId: typeof designPublicId === 'string' && designPublicId ? designPublicId : null,
    originalName: file.name || 'artwork.png',
    mime: 'image/png',
    width,
    height,
    bytes: normalized.length,
    data: normalized,
  });

  return NextResponse.json(
    { id: asset.id, width, height, url: `/api/assets/${asset.id}` },
    { status: 201 },
  );
}
