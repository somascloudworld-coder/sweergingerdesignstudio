import sharp from 'sharp';

/**
 * Server-side rasterisation of the shared SVG scene. There is exactly one renderer
 * (layersToSvg); this only turns its output into pixels for the print floor.
 *
 * UNVERIFIED here: the SVG has explicit width/height, so Sharp rasterises at that
 * size. The 96 dpi base is a placeholder until D4 gives the real print-floor spec.
 */
export async function rasterizeSvg(svg: string): Promise<{
  data: Buffer;
  width: number;
  height: number;
}> {
  // No explicit density: the SVG already carries explicit width/height in pixels
  // (layersToSvg scales them), so 1 SVG unit renders as 1 output pixel.
  const image = sharp(Buffer.from(svg));
  const metadata = await image.metadata();
  const data = await image.png().toBuffer();
  return { data, width: metadata.width ?? 0, height: metadata.height ?? 0 };
}
