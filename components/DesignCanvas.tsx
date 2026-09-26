'use client';

import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { clampLayerToArea } from '@/lib/geometry';
import type { ImageLayer, Layer, PrintArea, TextLayer } from '@/lib/types';

interface Props {
  area: PrintArea;
  layers: Layer[];
  selectedId: string | null;
  /** Bumped by the owner when the canvas must rebuild from `layers`. */
  revision: number;
  onLayersChange: (layers: Layer[]) => void;
  onSelect: (id: string | null) => void;
}

const BOUNDARY_ID = '__print_area__';

type TaggedObject = fabric.FabricObject & { layerId?: string };

function tag(object: fabric.FabricObject, id: string): void {
  (object as TaggedObject).layerId = id;
}

function tagOf(object: fabric.FabricObject): string | undefined {
  return (object as TaggedObject).layerId;
}

export function DesignCanvas({
  area,
  layers,
  selectedId,
  revision,
  onLayersChange,
  onSelect,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const layersRef = useRef<Layer[]>(layers);
  const selectedRef = useRef<string | null>(selectedId);
  const emitRef = useRef(onLayersChange);
  const selectRef = useRef(onSelect);
  const applyingRef = useRef(false);
  const rebuildToken = useRef(0);

  layersRef.current = layers;
  selectedRef.current = selectedId;
  emitRef.current = onLayersChange;
  selectRef.current = onSelect;

  function layerFromObject(object: fabric.FabricObject, original: Layer | undefined): Layer | null {
    const layerId = tagOf(object);
    if (!layerId || !original) return null;
    const common = {
      id: layerId,
      x: object.left ?? 0,
      y: object.top ?? 0,
      width: (object.width ?? 0) || 1,
      height: (object.height ?? 0) || 1,
      scaleX: object.scaleX ?? 1,
      scaleY: object.scaleY ?? 1,
      angle: object.angle ?? 0,
      z: original.z,
    };
    if (original.type === 'text') {
      return {
        ...common,
        type: 'text',
        text: original.text,
        fontFamily: original.fontFamily,
        fontSize: original.fontSize,
        fill: original.fill,
        fontWeight: original.fontWeight,
        fontStyle: original.fontStyle,
        textAlign: original.textAlign,
      } satisfies TextLayer;
    }
    return {
      ...common,
      type: 'image',
      assetId: original.assetId,
      opacity: original.opacity,
    } satisfies ImageLayer;
  }

  function serialize(): Layer[] {
    const canvas = canvasRef.current;
    if (!canvas) return layersRef.current;
    const out: Layer[] = [];
    for (const object of canvas.getObjects()) {
      const id = tagOf(object);
      if (!id || id === BOUNDARY_ID) continue;
      const layer = layerFromObject(object, layersRef.current.find((l) => l.id === id));
      if (layer) out.push(layer);
    }
    // Preserve any layer the canvas has not drawn yet (e.g. a still-loading image).
    for (const layer of layersRef.current) {
      if (!out.some((l) => l.id === layer.id)) out.push(layer);
    }
    return out.sort((a, b) => a.z - b.z);
  }

  function clampObject(object: fabric.FabricObject) {
    const id = tagOf(object);
    if (!id || id === BOUNDARY_ID) return;
    const layer = layerFromObject(object, layersRef.current.find((l) => l.id === id));
    if (!layer) return;
    const clamped = clampLayerToArea(layer, area);
    object.set({
      left: clamped.x,
      top: clamped.y,
      scaleX: clamped.scaleX,
      scaleY: clamped.scaleY,
    });
    object.setCoords();
  }

  useEffect(() => {
    const element = canvasElRef.current;
    const wrapper = wrapperRef.current;
    if (!element || !wrapper) return;

    const canvas = new fabric.Canvas(element, {
      width: area.width,
      height: area.height,
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: 'rgba(255,255,255,0.55)',
    });
    canvasRef.current = canvas;

    const boundary = new fabric.Rect({
      left: 0,
      top: 0,
      width: area.width,
      height: area.height,
      fill: 'transparent',
      stroke: 'rgba(28,26,23,0.45)',
      strokeWidth: 1,
      strokeDashArray: [6, 6],
      selectable: false,
      evented: false,
      hoverCursor: 'default',
    });
    tag(boundary, BOUNDARY_ID);
    canvas.add(boundary);

    const applySelection = () => {
      const id = canvas.getActiveObject() ? tagOf(canvas.getActiveObject()!) ?? null : null;
      selectRef.current(id === BOUNDARY_ID ? null : id);
    };

    const handleChange = () => {
      if (applyingRef.current) return;
      const active = canvas.getActiveObject();
      if (active) clampObject(active);
      emitRef.current(serialize());
    };

    canvas.on('object:moving', handleChange);
    canvas.on('object:scaling', handleChange);
    canvas.on('object:rotating', handleChange);
    canvas.on('object:modified', handleChange);
    canvas.on('selection:created', applySelection);
    canvas.on('selection:updated', applySelection);
    canvas.on('selection:cleared', () => selectRef.current(null));

    const fitZoom = () => {
      const available = wrapper.clientWidth || area.width;
      const zoom = Math.min(1, available / area.width);
      canvas.setDimensions({ width: area.width * zoom, height: area.height * zoom });
      canvas.setZoom(zoom);
      canvas.requestRenderAll();
    };
    fitZoom();
    const observer = new ResizeObserver(fitZoom);
    observer.observe(wrapper);

    return () => {
      observer.disconnect();
      void canvas.dispose();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.id, area.width, area.height]);

  // Rebuild objects whenever the owner bumps the revision (side switch, add/delete, load).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const token = ++rebuildToken.current;
    applyingRef.current = true;

    const existing = new Map<string, fabric.FabricObject>();
    for (const object of canvas.getObjects()) {
      const id = tagOf(object);
      if (id && id !== BOUNDARY_ID) existing.set(id, object);
    }
    for (const object of existing.values()) canvas.remove(object);

    const additions: fabric.FabricObject[] = [];
    const pending: Promise<void>[] = [];

    for (const layer of [...layersRef.current].sort((a, b) => a.z - b.z)) {
      if (layer.type === 'text') {
        const textbox = new fabric.Textbox(layer.text, {
          left: layer.x,
          top: layer.y,
          originX: 'center',
          originY: 'center',
          width: layer.width,
          fontSize: layer.fontSize,
          fontFamily: layer.fontFamily,
          fill: layer.fill,
          fontWeight: layer.fontWeight,
          fontStyle: layer.fontStyle,
          textAlign: layer.textAlign,
          angle: layer.angle,
          scaleX: layer.scaleX,
          scaleY: layer.scaleY,
        });
        tag(textbox, layer.id);
        additions.push(textbox);
      } else {
        const cached = existing.get(layer.id) as fabric.FabricImage | undefined;
        if (cached) {
          cached.set({
            left: layer.x,
            top: layer.y,
            scaleX: layer.scaleX,
            scaleY: layer.scaleY,
            angle: layer.angle,
            opacity: layer.opacity,
          });
          cached.setCoords();
          additions.push(cached);
        } else {
          pending.push(
            fabric.FabricImage.fromURL(`/api/assets/${layer.assetId}`, {
              crossOrigin: 'anonymous',
            }).then((image) => {
              image.set({
                left: layer.x,
                top: layer.y,
                originX: 'center',
                originY: 'center',
                scaleX: layer.scaleX,
                scaleY: layer.scaleY,
                angle: layer.angle,
                opacity: layer.opacity,
              });
              tag(image, layer.id);
              additions.push(image);
            }),
          );
        }
      }
    }

    const finish = () => {
      if (token !== rebuildToken.current) return;
      for (const object of additions) canvas.add(object);
      canvas.requestRenderAll();
      applyingRef.current = false;
    };

    if (pending.length > 0) {
      void Promise.all(pending).then(finish);
    } else {
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, area.id]);

  // Selection is applied without a rebuild, so clicking a layer never resets transforms.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    applyingRef.current = true;
    if (!selectedId) {
      canvas.discardActiveObject();
    } else {
      const target = canvas.getObjects().find((o) => tagOf(o) === selectedId);
      if (target) canvas.setActiveObject(target);
    }
    canvas.requestRenderAll();
    applyingRef.current = false;
  }, [selectedId, revision]);

  return (
    <div ref={wrapperRef} className="canvas-container">
      <canvas ref={canvasElRef} />
    </div>
  );
}
