import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/db';
import { rasterizeSvg } from '@/lib/render/raster';
import { layersToSvg, type ResolvedImage } from '@/lib/render/scene';
import { currentStaff } from '@/lib/server/auth';
import type { Layer, PrintOutput, Side } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Placeholder: the SVG scene is authored at 96 dpi. D4 supplies the real print spec. */
const BASE_DPI = 96;
const PRINT_DPI = Number.isFinite(Number(process.env.PRINT_DPI)) ? Number(process.env.PRINT_DPI) : 300;

type Context = { params: Promise<{ id: string }> };

/**
 * Generates the print-ready output from the same layersToSvg the preview uses
 * (IMPLEMENTATION-PLAN step 12). Embroidery is never auto-digitized: it preserves
 * placement/size/colour intent and is flagged for manual digitizing (PRD section 3).
 */
export async function POST(_request: Request, context: Context) {
  const staff = await currentStaff();
  if (!staff) return NextResponse.json({ error: 'Staff sign-in required.' }, { status: 401 });

  const { id } = await context.params;
  const repo = await getRepo();
  const order = await repo.getOrder(id);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const outputs: PrintOutput[] = [];
  const notes: string[] = [];
  const embroideryIntents: Record<string, unknown>[] = [];

  for (const line of order.lines) {
    const product = await repo.getProduct(line.productId);
    if (!product) continue;

    for (const side of ['front', 'back'] as Side[]) {
      const layers: Layer[] = line.designSides[side] ?? [];
      if (layers.length === 0) continue;

      const area = product.printAreas.find((a) => a.side === side);
      if (!area) {
        notes.push(`No print area is configured for ${product.name} (${side}); skipped.`);
        continue;
      }

      const images: Record<string, ResolvedImage> = {};
      for (const layer of layers) {
        if (layer.type !== 'image') continue;
        const asset = await repo.getAsset(layer.assetId);
        if (!asset) {
          notes.push(`Missing artwork asset ${layer.assetId}; exported without it.`);
          continue;
        }
        const data = await repo.readAssetData(asset);
        images[layer.assetId] = {
          href: `data:${asset.mime};base64,${data.toString('base64')}`,
          width: asset.width,
          height: asset.height,
        };
      }

      const scale = PRINT_DPI / BASE_DPI;
      const svg = layersToSvg(layers, {
        area: { width: area.width, height: area.height },
        scale,
        background: null,
        images,
      });
      const raster = await rasterizeSvg(svg);

      // Storage goes through the repository: local disk here, object storage on a
      // serverless host. A route must never assume a writable filesystem.
      const filePath = await repo.writePrintOutputFile(
        `print/${order.publicId}/${line.id}-${side}.png`,
        raster.data,
        'image/png',
      );

      const manualDigitizingRequired = line.printMethod === 'EMBROIDERY';
      const output = await repo.addPrintOutput({
        orderItemId: line.id,
        side,
        printMethod: line.printMethod,
        format: 'png',
        widthPx: raster.width,
        heightPx: raster.height,
        dpi: PRINT_DPI,
        provisional: area.provisional,
        manualDigitizingRequired,
        filePath,
      });

      if (manualDigitizingRequired) {
        // The placement/size/colour intent is preserved for a human digitizer. It is
        // deterministic from data already stored (the order snapshot, the print area
        // and this output row), so it is returned here rather than duplicated into a
        // second file that a serverless host could not write.
        embroideryIntents.push({
          orderItemId: line.id,
          reference: `${order.publicId}/${line.id}-${side}`,
          note: 'For manual digitizing. Not a stitch file.',
          garment: product.name,
          colour: line.colourName,
          side,
          printMethod: line.printMethod,
          placement: { x: area.x, y: area.y },
          printableAreaPx: { width: area.width, height: area.height },
          outputPx: { width: raster.width, height: raster.height },
          dpi: PRINT_DPI,
          colours: layers
            .filter((l): l is Extract<Layer, { type: 'text' }> => l.type === 'text')
            .map((l) => l.fill),
        });
      }

      outputs.push(output);
    }
  }

  return NextResponse.json({
    outputs,
    dpi: PRINT_DPI,
    provisional: outputs.some((o) => o.provisional),
    embroideryIntents,
    notes,
  });
}
