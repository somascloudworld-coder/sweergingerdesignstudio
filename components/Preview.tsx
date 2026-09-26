'use client';

import { useMemo } from 'react';
import { GARMENT_HEIGHT, GARMENT_WIDTH } from '@/lib/catalog';
import { layersToSvg } from '@/lib/render/scene';
import type { Layer, PrintArea } from '@/lib/types';

interface Props {
  colourHex: string;
  garmentPath: string;
  area: PrintArea;
  layers: Layer[];
  showBoundary?: boolean;
  maxWidth?: number;
}

function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 1;
  const value = parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The design is composited onto the real garment colour in the browser, not left as a
 * flat overlay: ink blends into light fabric (multiply) and sits opaque on dark fabric,
 * and the garment's own shading is laid back over the design inside the print zone.
 */
export function Preview({
  colourHex,
  garmentPath,
  area,
  layers,
  showBoundary = false,
  maxWidth = 360,
}: Props) {
  const svg = useMemo(
    () => layersToSvg(layers, { area: { width: area.width, height: area.height } }),
    [layers, area.width, area.height],
  );
  const designHref = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    [svg],
  );

  const luminance = relativeLuminance(colourHex);
  const light = luminance >= 0.55;
  const blendMode = light ? 'multiply' : 'normal';
  const designOpacity = light ? 0.95 : 0.97;

  const zone = {
    left: `${(area.x / GARMENT_WIDTH) * 100}%`,
    top: `${(area.y / GARMENT_HEIGHT) * 100}%`,
    width: `${(area.width / GARMENT_WIDTH) * 100}%`,
    height: `${(area.height / GARMENT_HEIGHT) * 100}%`,
  };

  // The full garment image, offset so its print-area region lines up with the zone.
  const shade = {
    width: `${(GARMENT_WIDTH / area.width) * 100}%`,
    height: `${(GARMENT_HEIGHT / area.height) * 100}%`,
    left: `${-(area.x / area.width) * 100}%`,
    top: `${-(area.y / area.height) * 100}%`,
  };

  return (
    <div className="preview-frame" style={{ maxWidth }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="garment" src={garmentPath} alt="" />
      <div className="print-zone" style={zone}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="design-art"
          src={designHref}
          alt="Your design preview"
          style={{ mixBlendMode: blendMode, opacity: designOpacity }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="design-art"
          src={garmentPath}
          alt=""
          style={{ ...shade, position: 'absolute', mixBlendMode: 'multiply', opacity: 0.5 }}
        />
        {showBoundary ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: '1px dashed rgba(28,26,23,0.5)',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
