import type { Layer, PrintArea, DesignSides, Side } from './types';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const EPSILON = 0.01;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Axis-aligned bounding box of a layer, including rotation, in print-area local space. */
export function layerBounds(layer: Layer): Box {
  const w = Math.abs(layer.width * layer.scaleX);
  const h = Math.abs(layer.height * layer.scaleY);
  const rad = toRadians(layer.angle);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (w * cos + h * sin) / 2;
  const halfH = (w * sin + h * cos) / 2;
  return {
    left: layer.x - halfW,
    top: layer.y - halfH,
    right: layer.x + halfW,
    bottom: layer.y + halfH,
  };
}

export function boxWidth(box: Box): number {
  return box.right - box.left;
}

export function boxHeight(box: Box): number {
  return box.bottom - box.top;
}

/**
 * Largest uniform scale factor that keeps the element's rotated bounding box inside
 * the print area. Never returns less than a tiny positive value so a caller can
 * always recover; the element is clamped to fit rather than rejected outright.
 */
export function maxUniformScaleForArea(layer: Layer, area: PrintArea): number {
  const w = Math.abs(layer.width) || 1;
  const h = Math.abs(layer.height) || 1;
  const rad = toRadians(layer.angle);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rotatedW = w * cos + h * sin;
  const rotatedH = w * sin + h * cos;
  return Math.min(area.width / rotatedW, area.height / rotatedH);
}

/**
 * Clamp a layer so its rotated bounding box sits inside the print area: the client
 * uses this for UX, and the server uses the same function to decide authority.
 */
export function clampLayerToArea(layer: Layer, area: PrintArea): Layer {
  const uniformScale = Math.min(Math.abs(layer.scaleX), Math.abs(layer.scaleY));
  const maxScale = maxUniformScaleForArea(
    { ...layer, scaleX: uniformScale, scaleY: uniformScale },
    area,
  );
  let scale = uniformScale;
  if (uniformScale > maxScale) scale = maxScale;
  scale = Math.max(scale, 0.01);

  const scaled: Layer = { ...layer, scaleX: scale, scaleY: scale };
  const box = layerBounds(scaled);
  const halfW = boxWidth(box) / 2;
  const halfH = boxHeight(box) / 2;

  const x = Math.min(Math.max(scaled.x, halfW), Math.max(area.width - halfW, halfW));
  const y = Math.min(Math.max(scaled.y, halfH), Math.max(area.height - halfH, halfH));

  return { ...scaled, x, y };
}

export function isLayerInsideArea(layer: Layer, area: PrintArea): boolean {
  const box = layerBounds(layer);
  return (
    box.left >= -EPSILON &&
    box.top >= -EPSILON &&
    box.right <= area.width + EPSILON &&
    box.bottom <= area.height + EPSILON
  );
}

export interface DesignValidationIssue {
  side: Side;
  layerId: string | null;
  code: 'missing_print_area' | 'out_of_bounds' | 'empty_layer' | 'unknown_asset';
  message: string;
}

export interface DesignValidationResult {
  ok: boolean;
  issues: DesignValidationIssue[];
  /** Layers after clamping, so a caller can offer a corrected design back to the user. */
  corrected: DesignSides;
}

/**
 * Authoritative check: every layer on every side must sit inside that side's stored
 * print area. The client clamp is UX; this is enforcement (IMPLEMENTATION-PLAN step 4).
 */
export function validateDesignSides(
  sides: DesignSides,
  areas: Partial<Record<Side, PrintArea>>,
): DesignValidationResult {
  const issues: DesignValidationIssue[] = [];
  const corrected: DesignSides = { front: [], back: [] };

  for (const side of ['front', 'back'] as Side[]) {
    const layers = sides[side] ?? [];
    const area = areas[side];

    for (const layer of layers) {
      if (!layer || layer.width <= 0 || layer.height <= 0) {
        issues.push({
          side,
          layerId: layer?.id ?? null,
          code: 'empty_layer',
          message: `${side}: a layer has no measurable size.`,
        });
        corrected[side].push(layer);
        continue;
      }

      if (layer.type === 'text' && !layer.text.trim()) {
        issues.push({
          side,
          layerId: layer.id,
          code: 'empty_layer',
          message: `${side}: a text layer is empty.`,
        });
      }

      if (!area) {
        // A side with content but no configured print area cannot be validated.
        if (layers.length > 0) {
          issues.push({
            side,
            layerId: null,
            code: 'missing_print_area',
            message: `${side}: no print area is configured for this product.`,
          });
        }
        corrected[side].push(layer);
        continue;
      }

      if (!isLayerInsideArea(layer, area)) {
        issues.push({
          side,
          layerId: layer.id,
          code: 'out_of_bounds',
          message: `${side}: layer ${layer.id} crosses the print boundary.`,
        });
        corrected[side].push(clampLayerToArea(layer, area));
      } else {
        corrected[side].push(layer);
      }
    }
  }

  return { ok: issues.length === 0, issues, corrected };
}

export function nextZ(layers: Layer[]): number {
  return layers.reduce((max, l) => Math.max(max, l.z), 0) + 1;
}
