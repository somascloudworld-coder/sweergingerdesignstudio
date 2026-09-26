import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const repo = await getRepo();
  const asset = await repo.getAsset(id);
  if (!asset) return new NextResponse('Not found', { status: 404 });

  const data = await repo.readAssetData(asset);
  return new NextResponse(new Uint8Array(data), {
    headers: { 'content-type': asset.mime, 'cache-control': 'private, max-age=60' },
  });
}
