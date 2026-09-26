import { describe, expect, it } from 'vitest';
import { clampLayerToArea, isLayerInsideArea, layerBounds, validateDesignSides } from '@/lib/geometry';
import type { DesignSides, PrintArea, TextLayer } from '@/lib/types';

const area: PrintArea = {
  id: 'a1',
  productId: 'p1',
  side: 'front',
  x: 0,
  y: 0,
  width: 300,
  height: 380,
  units: 'px',
  provisional: true,
};

function text(partial: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 'l1',
    type: 'text',
    x: 150,
    y: 190,
    width: 100,
    height: 40,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    z: 1,
    text: 'Sweet Ginger',
    fontFamily: 'Arial',
    fontSize: 32,
    fill: '#111111',
    fontWeight: 'bold',
    fontStyle: 'normal',
    textAlign: 'center',
    ...partial,
  };
}

describe('layerBounds', () => {
  it('is the element box centred on x/y when unrotated', () => {
    const box = layerBounds(text({ x: 100, y: 100, width: 100, height: 40 }));
    expect(box).toEqual({ left: 50, top: 80, right: 150, bottom: 120 });
  });

  it('grows the axis-aligned box when rotated 90 degrees', () => {
    const box = layerBounds(text({ x: 100, y: 100, width: 100, height: 40, angle: 90 }));
    expect(box.right - box.left).toBeCloseTo(40);
    expect(box.bottom - box.top).toBeCloseTo(100);
  });
});

describe('clampLayerToArea', () => {
  it('pulls an out-of-bounds layer back inside the boundary', () => {
    const escaped = text({ x: 400, y: 500, scaleX: 1, scaleY: 1 });
    expect(isLayerInsideArea(escaped, area)).toBe(false);
    const clamped = clampLayerToArea(escaped, area);
    expect(isLayerInsideArea(clamped, area)).toBe(true);
  });

  it('shrinks a layer that is scaled larger than the print area', () => {
    const huge = text({ scaleX: 8, scaleY: 8 });
    const clamped = clampLayerToArea(huge, area);
    const box = layerBounds(clamped);
    expect(box.right - box.left).toBeLessThanOrEqual(area.width + 0.01);
    expect(box.bottom - box.top).toBeLessThanOrEqual(area.height + 0.01);
  });
});

describe('validateDesignSides', () => {
  it('accepts an empty design', () => {
    const sides: DesignSides = { front: [], back: [] };
    const result = validateDesignSides(sides, { front: area });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects an out-of-bounds layer and offers a corrected one', () => {
    const sides: DesignSides = { front: [text({ x: 1000, y: 1000 })], back: [] };
    const result = validateDesignSides(sides, { front: area });
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe('out_of_bounds');
    expect(isLayerInsideArea(result.corrected.front[0], area)).toBe(true);
  });

  it('flags a missing print area rather than silently passing content', () => {
    const sides: DesignSides = { front: [text()], back: [] };
    const result = validateDesignSides(sides, {});
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe('missing_print_area');
  });

  it('flags an empty text layer', () => {
    const sides: DesignSides = { front: [text({ text: '   ' })], back: [] };
    const result = validateDesignSides(sides, { front: area });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'empty_layer')).toBe(true);
  });
});
