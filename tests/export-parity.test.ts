import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { rasterizeSvg } from '@/lib/render/raster';
import { layersToSvg } from '@/lib/render/scene';
import type { ImageLayer, Layer, TextLayer } from '@/lib/types';

const AREA = { width: 300, height: 380 };
const BASE_DPI = 96;
const PRINT_DPI = 300;

async function blueSquare(): Promise<Buffer> {
  return sharp({
    create: { width: 120, height: 120, channels: 4, background: { r: 20, g: 80, b: 190, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

async function buildLayers(): Promise<{ layers: Layer[]; images: Record<string, { href: string; width: number; height: number }> }> {
  const png = await blueSquare();
  const text: TextLayer = {
    id: 't',
    type: 'text',
    x: 150,
    y: 90,
    width: 240,
    height: 46,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    z: 2,
    text: 'Sweet Ginger',
    fontFamily: 'Arial',
    fontSize: 34,
    fill: '#111111',
    fontWeight: 'bold',
    fontStyle: 'normal',
    textAlign: 'center',
  };
  const image: ImageLayer = {
    id: 'i',
    type: 'image',
    x: 150,
    y: 250,
    width: 120,
    height: 120,
    scaleX: 1.4,
    scaleY: 1.4,
    angle: 10,
    z: 1,
    assetId: 'asset_test',
    opacity: 1,
  };
  return {
    layers: [image, text],
    images: { asset_test: { href: `data:image/png;base64,${png.toString('base64')}`, width: 120, height: 120 } },
  };
}

describe('preview and print export come from one renderer', () => {
  it('renders the same layout at both sizes', async () => {
    const { layers, images } = await buildLayers();

    const previewSvg = layersToSvg(layers, { area: AREA, scale: 1, images });
    const exportSvg = layersToSvg(layers, { area: AREA, scale: PRINT_DPI / BASE_DPI, images });

    const preview = await rasterizeSvg(previewSvg);
    const exported = await rasterizeSvg(exportSvg);
    expect(exported.width).toBe(Math.round(AREA.width * (PRINT_DPI / BASE_DPI)));

    // Downscale the print file to the preview size and compare layouts pixel by pixel.
    const exportSmall = await sharp(exported.data)
      .resize(preview.width, preview.height, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const previewRaw = await sharp(preview.data).ensureAlpha().raw().toBuffer();

    expect(exportSmall.length).toBe(previewRaw.length);

    let totalDiff = 0;
    let opaque = 0;
    for (let i = 0; i < previewRaw.length; i += 4) {
      const alpha = previewRaw[i + 3];
      if (alpha < 8) continue;
      opaque += 1;
      totalDiff +=
        Math.abs(previewRaw[i] - exportSmall[i]) +
        Math.abs(previewRaw[i + 1] - exportSmall[i + 1]) +
        Math.abs(previewRaw[i + 2] - exportSmall[i + 2]);
    }

    const inkCoverage = opaque / (previewRaw.length / 4);
    const meanDiff = opaque === 0 ? 255 : totalDiff / (opaque * 3);

    // The export must contain real ink (so it is not a blank file) ...
    expect(inkCoverage).toBeGreaterThan(0.05);
    // ... and match the preview's layout closely once scaled to the same size.
    expect(meanDiff).toBeLessThan(16);
  });

  it('renders text, not just images (a print file missing text would be unusable)', async () => {
    const text: TextLayer = {
      id: 't',
      type: 'text',
      x: 150,
      y: 190,
      width: 240,
      height: 46,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      z: 1,
      text: 'SGR',
      fontFamily: 'Arial',
      fontSize: 64,
      fill: '#000000',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textAlign: 'center',
    };
    const svg = layersToSvg([text], { area: AREA, scale: PRINT_DPI / BASE_DPI });
    const raster = await rasterizeSvg(svg);
    const { info } = await sharp(raster.data).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    // If the text had not rasterised, trim() would collapse the image to ~1 px.
    expect(info.width).toBeGreaterThan(40);
    expect(info.height).toBeGreaterThan(20);
  });
});
