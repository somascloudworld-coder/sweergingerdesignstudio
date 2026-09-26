import { getRepo } from '@/lib/db';
import { currentStaff } from '@/lib/server/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const staff = await currentStaff();
  if (!staff) return new NextResponse('Staff sign-in required.', { status: 401 });

  const { id } = await context.params;
  const repo = await getRepo();
  const output = await repo.getPrintOutput(id);
  if (!output) return new NextResponse('Not found', { status: 404 });

  const data = await repo.readPrintOutputData(id);
  if (!data) return new NextResponse('File missing', { status: 404 });

  const inline = new URL(request.url).searchParams.get('inline') === '1';
  const filename = `${output.printMethod.toLowerCase()}-${output.side}-${output.dpi}dpi.png`;
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'content-type': 'image/png',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
