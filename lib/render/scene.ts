import type { Layer } from '../types';

export interface ResolvedImage {
  /** A data URI (print export) or an object/served URL (browser preview). */
  href: string;
  width: number;
  height: number;
}

export interface SceneArea {
  width: number;
  height: number;
}

export interface RenderSceneOptions {
  area: SceneArea;
  scale?: number;
  background?: string | null;
  images?: Record<string, ResolvedImage>;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textAnchor(align: 'left' | 'center' | 'right'): string {
  if (align === 'left') return 'start';
  if (align === 'right') return 'end';
  return 'middle';
}

function renderLayer(layer: Layer, images: Record<string, ResolvedImage>): string {
  const transform = `rotate(${layer.angle} ${layer.x} ${layer.y})`;

  if (layer.type === 'text') {
    const weight = layer.fontWeight === 'bold' ? ' font-weight="bold"' : '';
    const style = layer.fontStyle === 'italic' ? ' font-style="italic"' : '';
    return (
      `<text x="${layer.x}" y="${layer.y}" font-family="${escapeXml(layer.fontFamily)}" ` +
      `font-size="${layer.fontSize}" fill="${escapeXml(layer.fill)}" ` +
      `text-anchor="${textAnchor(layer.textAlign)}" dominant-baseline="central" ` +
      `transform="${transform}"${weight}${style}>${escapeXml(layer.text)}</text>`
    );
  }

  const resolved = images[layer.assetId];
  const href = resolved?.href ?? '';
  const w = layer.width * layer.scaleX;
  const h = layer.height * layer.scaleY;
  return (
    `<image href="${escapeXml(href)}" x="${layer.x - w / 2}" y="${layer.y - h / 2}" ` +
    `width="${w}" height="${h}" opacity="${layer.opacity ?? 1}" ` +
    `preserveAspectRatio="xMidYMid meet" transform="${transform}" />`
  );
}

/**
 * The single source of render truth. Both the on-garment preview and the server-side
 * print export call this one function, so they cannot drift apart
 * (IMPLEMENTATION-PLAN step 12, "one rendering implementation").
 */
export function layersToSvg(layers: Layer[], options: RenderSceneOptions): string {
  const scale = options.scale ?? 1;
  const { width, height } = options.area;
  const ordered = [...layers].sort((a, b) => a.z - b.z);
  const background =
    options.background === null || options.background === undefined
      ? ''
      : `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(options.background)}" />`;
  const body = ordered.map((layer) => renderLayer(layer, options.images ?? {})).join('\n  ');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `,
    `viewBox="0 0 ${width} ${height}" width="${width * scale}" height="${height * scale}">`,
    background,
    body,
    `</svg>`,
  ].join('');
}

/** Boundary overlay for the editor UI only; never part of an export. */
export function boundaryRect(area: SceneArea, stroke = '#111', dash = '6 6'): string {
  return (
    `<rect x="0.5" y="0.5" width="${area.width - 1}" height="${area.height - 1}" ` +
    `fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="${dash}" />`
  );
}
