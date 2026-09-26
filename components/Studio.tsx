'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DesignCanvas } from './DesignCanvas';
import { Preview } from './Preview';
import { GARMENT_SIZES } from '@/lib/catalog';
import { formatPaise } from '@/lib/pricing';
import { useStudio, type CartLine } from '@/lib/store';
import type {
  Design,
  Layer,
  PrintArea,
  PrintMethod,
  ProductWithDetails,
  Side,
  SizeQuantity,
  TextLayer,
} from '@/lib/types';

const FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact'];
const INK_COLOURS = ['#111111', '#ffffff', '#b4462a', '#1e2a44', '#2f7d54', '#d8a01f'];

interface Props {
  products: ProductWithDetails[];
  initialDesign: Design | null;
}

function copySides(sides: { front: Layer[]; back: Layer[] }) {
  return structuredClone(sides);
}

function newTextLayer(area: PrintArea, index: number): TextLayer {
  return {
    id: `t_${Date.now()}_${index}`,
    type: 'text',
    x: area.width / 2,
    y: area.height / 2,
    width: Math.min(area.width - 20, 220),
    height: 44,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    z: index + 1,
    text: 'Your text',
    fontFamily: 'Arial',
    fontSize: 32,
    fill: '#111111',
    fontWeight: 'bold',
    fontStyle: 'normal',
    textAlign: 'center',
  };
}

export function Studio({ products, initialDesign }: Props) {
  const store = useStudio();
  const hydrated = store.hydrated;

  const [orderType, setOrderType] = useState<'B2C' | 'B2B'>('B2C');
  const [printMethod, setPrintMethod] = useState<PrintMethod>('DTF');
  const [sizes, setSizes] = useState<SizeQuantity[]>([{ size: 'M', qty: 1 }]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    unitPricePaise: number;
    quantity: number;
    lineTotalPaise: number;
    provisional: boolean;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const designPromise = useRef<Promise<string | null> | null>(null);

  const product = useMemo(
    () => products.find((p) => p.id === store.productId) ?? products[0],
    [products, store.productId],
  );
  const variant = useMemo(
    () => product.variants.find((v) => v.id === store.variantId) ?? product.variants[0],
    [product, store.variantId],
  );
  const area = useMemo(
    () => product.printAreas.find((a) => a.side === store.side) ?? product.printAreas[0],
    [product, store.side],
  );
  const backArea = useMemo(
    () => product.printAreas.find((a) => a.side === 'back') ?? null,
    [product],
  );

  const layers = store.sides[store.side] ?? [];
  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null;
  const designLayerCount = store.sides.front.length + store.sides.back.length;

  // Establish an initial product selection once the cart has hydrated.
  useEffect(() => {
    if (!hydrated) return;
    if (!store.productId || !products.some((p) => p.id === store.productId)) {
      store.setProduct(products[0].id, products[0].variants[0].id);
    }
  }, [hydrated, products, store]);

  // Adopt a design that was loaded from ?design=<id>.
  useEffect(() => {
    if (initialDesign) {
      store.setDesign(initialDesign.publicId, initialDesign.sides, initialDesign.variantId);
      setRevision((r) => r + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDesign]);

  // Reads the live store (never a stale render snapshot) and de-duplicates concurrent
  // creation, so the design is linked to the editor without overwriting its layers.
  const ensureDesign = useCallback(async (): Promise<string | null> => {
    const existing = useStudio.getState().designPublicId;
    if (existing) return existing;
    if (designPromise.current) return designPromise.current;
    designPromise.current = (async () => {
      try {
        const response = await fetch('/api/designs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productId: product.id, variantId: variant.id }),
        });
        if (!response.ok) return null;
        const design = (await response.json()) as Design;
        useStudio.getState().setDesign(design.publicId, null, design.variantId);
        window.history.replaceState(null, '', `/?design=${design.publicId}`);
        return design.publicId;
      } catch {
        return null;
      }
    })();
    const result = await designPromise.current;
    designPromise.current = null;
    return result;
  }, [product.id, variant.id]);

  const persist = useCallback(
    async (sides: { front: Layer[]; back: Layer[] }, variantId: string) => {
      const id = await ensureDesign();
      if (!id) return;
      store.beginSave();
      try {
        const response = await fetch(`/api/designs/${id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sides, variantId }),
        });
        if (response.status === 422) {
          const body = (await response.json()) as { error: string };
          store.finishSave(false, body.error);
          setError(body.error);
          return;
        }
        if (!response.ok) {
          store.finishSave(false, 'Save failed');
          return;
        }
        store.finishSave(true);
      } catch {
        store.finishSave(false, 'Save failed');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ensureDesign],
  );

  const scheduleSave = useCallback(
    (sides: { front: Layer[]; back: Layer[] }, variantId: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void persist(sides, variantId), 700);
    },
    [persist],
  );

  const handleLayersChange = useCallback(
    (nextLayers: Layer[]) => {
      const state = useStudio.getState();
      const next = { ...state.sides, [state.side]: nextLayers };
      state.setSideLayers(state.side, nextLayers);
      scheduleSave(next, variant.id);
    },
    [variant.id, scheduleSave],
  );

  // Server-side quote on every material change. The browser never decides the price.
  useEffect(() => {
    const quantity = sizes.reduce((sum, s) => sum + s.qty, 0);
    if (quantity < 1) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/orders/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            lines: [
              {
                productId: product.id,
                variantId: variant.id,
                printMethod,
                sizes,
              },
            ],
          }),
        });
        if (!response.ok) return;
        const body = (await response.json()) as {
          lines: { unitPricePaise: number; quantity: number; lineTotalPaise: number; provisional: boolean }[];
        };
        if (!cancelled && body.lines[0]) setQuote(body.lines[0]);
      } catch {
        /* the quote is an estimate; checkout re-prices server-side regardless */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product.id, variant.id, printMethod, sizes]);

  function switchProduct(nextId: string) {
    if (nextId === product.id) return;
    if (designLayerCount > 0) {
      const confirmed = window.confirm(
        'Switching product type starts a new design. The current design will be discarded. Continue?',
      );
      if (!confirmed) return;
    }
    const next = products.find((p) => p.id === nextId)!;
    store.setProduct(next.id, next.variants[0].id);
    setSelectedId(null);
    setRevision((r) => r + 1);
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }

  function switchVariant(nextVariantId: string) {
    // Colour change never touches the design (PRD Rule 1).
    const state = useStudio.getState();
    state.setVariant(nextVariantId);
    scheduleSave(state.sides, nextVariantId);
  }

  function switchSide(side: Side) {
    store.setSide(side);
    setSelectedId(null);
    setRevision((r) => r + 1);
  }

  /** All editor mutations read the live store so they can never write a stale snapshot. */
  function commit(side: Side, next: Layer[]) {
    const state = useStudio.getState();
    state.setSideLayers(side, next);
    setRevision((r) => r + 1);
    scheduleSave({ ...state.sides, [side]: next }, variant.id);
  }

  function addText() {
    const state = useStudio.getState();
    const current = state.sides[state.side] ?? [];
    const layer = newTextLayer(area, current.length);
    commit(state.side, [...current, layer]);
    setSelectedId(layer.id);
  }

  function updateSelected(patch: Partial<TextLayer>) {
    if (!selectedLayer) return;
    const state = useStudio.getState();
    const current = state.sides[state.side] ?? [];
    commit(
      state.side,
      current.map((l) => (l.id === selectedLayer.id ? { ...l, ...patch } : l)) as Layer[],
    );
  }

  function deleteSelected() {
    if (!selectedId) return;
    const state = useStudio.getState();
    const current = state.sides[state.side] ?? [];
    commit(
      state.side,
      current.filter((l) => l.id !== selectedId),
    );
    setSelectedId(null);
  }

  function reorderSelected(direction: 'front' | 'back') {
    if (!selectedLayer) return;
    const state = useStudio.getState();
    const current = state.sides[state.side] ?? [];
    const sorted = [...current].sort((a, b) => a.z - b.z);
    const index = sorted.findIndex((l) => l.id === selectedLayer.id);
    const swap = direction === 'front' ? index + 1 : index - 1;
    if (swap < 0 || swap >= sorted.length) return;
    const next = current.map((l) => {
      if (l.id === sorted[index].id) return { ...l, z: sorted[swap].z };
      if (l.id === sorted[swap].id) return { ...l, z: sorted[index].z };
      return l;
    });
    commit(state.side, next);
  }

  async function uploadArtwork(file: File) {
    setUploading(true);
    setError(null);
    try {
      const id = await ensureDesign();
      const form = new FormData();
      form.append('file', file);
      if (id) form.append('designPublicId', id);
      const response = await fetch('/api/assets', { method: 'POST', body: form });
      const body = (await response.json()) as {
        id?: string;
        width?: number;
        height?: number;
        url?: string;
        error?: string;
      };
      if (!response.ok || !body.id || !body.width || !body.height) {
        setError(body.error ?? 'That artwork could not be uploaded.');
        return;
      }
      const maxSide = Math.min(area.width, area.height) * 0.8;
      const ratio = Math.min(maxSide / body.width, maxSide / body.height, 1);
      const state = useStudio.getState();
      const current = state.sides[state.side] ?? [];
      const layer: Layer = {
        id: `img_${Date.now()}`,
        type: 'image',
        x: area.width / 2,
        y: area.height / 2,
        width: body.width,
        height: body.height,
        scaleX: ratio,
        scaleY: ratio,
        angle: 0,
        z: current.length + 1,
        assetId: body.id,
        opacity: 1,
      };
      commit(state.side, [...current, layer]);
      setSelectedId(layer.id);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function setSizeQty(size: string, qty: number) {
    setSizes((current) => {
      const others = current.filter((s) => s.size !== size);
      if (qty <= 0) return orderType === 'B2C' ? [{ size, qty: 0 }] : others;
      return [...others, { size, qty }].sort(
        (a, b) => GARMENT_SIZES.indexOf(a.size) - GARMENT_SIZES.indexOf(b.size),
      );
    });
  }

  function switchOrderType(next: 'B2C' | 'B2B') {
    setOrderType(next);
    setSizes(next === 'B2C' ? [{ size: 'M', qty: 1 }] : GARMENT_SIZES.map((size) => ({ size, qty: 0 })));
  }

  function addToCart() {
    setError(null);
    setMessage(null);
    const quantity = sizes.reduce((sum, s) => sum + s.qty, 0);
    if (quantity < 1) {
      setError('Choose at least one size and quantity.');
      return;
    }
    if (designLayerCount === 0) {
      setError(
        'Add text or upload artwork before adding to the cart — a design with no elements is not printable.',
      );
      return;
    }
    const line: CartLine = {
      lineId: `line_${Date.now()}`,
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      colourName: variant.colourName,
      colourHex: variant.colourHex,
      garmentPath: variant.imagePath,
      area: { width: area.width, height: area.height },
      printMethod,
      sizes,
      // Freeze a copy now: later edits to the design must not change this line.
      designSides: copySides(store.sides),
      designPublicId: store.designPublicId,
    };
    store.addToCart(line);
    setMessage(`${product.name} in ${variant.colourName} added to the cart.`);
  }

  if (!hydrated) {
    return <p className="muted">Loading the studio…</p>;
  }

  const quantity = sizes.reduce((sum, s) => sum + s.qty, 0);

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <h1>Design a T-shirt</h1>
          <p className="sub" style={{ marginBottom: 0 }}>
            Pick a garment and colour, then add text or upload artwork. It stays inside the print area.
          </p>
        </div>
        <div className="row">
          <span className="pill">
            {store.saving ? 'Saving…' : store.lastSavedAt ? 'Design saved' : 'Not saved yet'}
          </span>
          {store.designPublicId ? (
            <span className="pill">Design {store.designPublicId}</span>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <div className="row">
            {products.map((p) => (
              <button
                key={p.id}
                className={p.id === product.id ? 'selected' : ''}
                onClick={() => switchProduct(p.id)}
              >
                {p.name} · {formatPaise(p.basePricePaise)}
              </button>
            ))}
          </div>
          <div style={{ minWidth: 240 }}>
            <span className="tiny muted">
              {product.description} · print area {area.width}×{area.height} px (placeholder)
            </span>
          </div>
        </div>
        <hr />
        <div className="row spread">
          <div>
            <label className="field">Colour — {variant.colourName}</label>
            <div className="swatches">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  className={`swatch ${v.id === variant.id ? 'selected' : ''}`}
                  style={{ background: v.colourHex }}
                  title={v.colourName}
                  aria-label={v.colourName}
                  onClick={() => switchVariant(v.id)}
                />
              ))}
            </div>
          </div>
          <div className="row">
            <button
              className={store.side === 'front' ? 'selected' : ''}
              onClick={() => switchSide('front')}
            >
              Front
            </button>
            {backArea ? (
              <button
                className={store.side === 'back' ? 'selected' : ''}
                onClick={() => switchSide('back')}
              >
                Back
              </button>
            ) : (
              <span className="pill warn" title="Back print area is not configured yet (C2/D4).">
                Back not configured
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="studio-grid grid">
        <div className="stack">
          <div className="editor-shell">
            <DesignCanvas
              area={area}
              layers={layers}
              selectedId={selectedId}
              revision={revision}
              onLayersChange={handleLayersChange}
              onSelect={setSelectedId}
            />
            <div className="toolbar">
              <button className="primary" onClick={addText}>
                Add text
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Upload artwork'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadArtwork(file);
                }}
              />
              <hr />
              {selectedLayer && selectedLayer.type === 'text' ? (
                <div className="stack">
                  <div>
                    <label className="field">Text</label>
                    <input
                      type="text"
                      value={selectedLayer.text}
                      maxLength={120}
                      onChange={(event) => updateSelected({ text: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field">Font</label>
                    <select
                      value={selectedLayer.fontFamily}
                      onChange={(event) => updateSelected({ fontFamily: event.target.value })}
                    >
                      {FONTS.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field">Size — {selectedLayer.fontSize}px</label>
                    <input
                      type="range"
                      min={10}
                      max={120}
                      value={selectedLayer.fontSize}
                      onChange={(event) =>
                        updateSelected({ fontSize: Number(event.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label className="field">Ink colour</label>
                    <div className="swatches">
                      {INK_COLOURS.map((colour) => (
                        <button
                          key={colour}
                          className={`swatch ${selectedLayer.fill === colour ? 'selected' : ''}`}
                          style={{ background: colour }}
                          aria-label={colour}
                          onClick={() => updateSelected({ fill: colour })}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="row">
                    <button
                      className={selectedLayer.fontWeight === 'bold' ? 'selected' : ''}
                      onClick={() =>
                        updateSelected({
                          fontWeight: selectedLayer.fontWeight === 'bold' ? 'normal' : 'bold',
                        })
                      }
                    >
                      B
                    </button>
                    <button
                      className={selectedLayer.fontStyle === 'italic' ? 'selected' : ''}
                      onClick={() =>
                        updateSelected({
                          fontStyle: selectedLayer.fontStyle === 'italic' ? 'normal' : 'italic',
                        })
                      }
                    >
                      I
                    </button>
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button
                        key={align}
                        className={selectedLayer.textAlign === align ? 'selected' : ''}
                        onClick={() => updateSelected({ textAlign: align })}
                      >
                        {align[0].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              ) : selectedLayer ? (
                <p className="small muted">
                  Artwork selected. Drag, scale or rotate it on the canvas.
                </p>
              ) : (
                <p className="small muted">Select a layer on the canvas to edit it.</p>
              )}
              <hr />
              <div className="row">
                <button onClick={() => reorderSelected('front')} disabled={!selectedLayer}>
                  Forward
                </button>
                <button onClick={() => reorderSelected('back')} disabled={!selectedLayer}>
                  Backward
                </button>
                <button onClick={deleteSelected} disabled={!selectedLayer}>
                  Delete
                </button>
              </div>
            </div>
          </div>
          {store.saveError ? <div className="error-box">Save rejected: {store.saveError}</div> : null}
          <p className="tiny muted">
            Print area {area.width}×{area.height} px · provisional placeholder until Ginger Prints
            supplies real dimensions (D4/C10).
          </p>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Preview</h2>
            <Preview
              colourHex={variant.colourHex}
              garmentPath={variant.imagePath}
              area={area}
              layers={layers}
              showBoundary
            />
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Composited on the garment colour with blend-mode shading. Placeholder garment art —
              real photography to be dropped in.
            </p>
          </div>

          <div className="card stack">
            <h2>Order</h2>
            <div className="row">
              <button
                className={orderType === 'B2C' ? 'selected' : ''}
                onClick={() => switchOrderType('B2C')}
              >
                Single (B2C)
              </button>
              <button
                className={orderType === 'B2B' ? 'selected' : ''}
                onClick={() => switchOrderType('B2B')}
              >
                Bulk (B2B)
              </button>
            </div>

            {orderType === 'B2C' ? (
              <div className="row">
                <div style={{ flex: '1 1 120px' }}>
                  <label className="field">Size</label>
                  <select
                    value={sizes[0]?.size ?? 'M'}
                    onChange={(event) => setSizes([{ size: event.target.value, qty: sizes[0]?.qty ?? 1 }])}
                  >
                    {GARMENT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <label className="field">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={sizes[0]?.qty ?? 1}
                    onChange={(event) =>
                      setSizes([{ size: sizes[0]?.size ?? 'M', qty: Math.max(1, Number(event.target.value)) }])
                    }
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="field">Quantity per size</label>
                <div className="size-grid">
                  {GARMENT_SIZES.map((size) => (
                    <div className="size-cell" key={size}>
                      <span>{size}</span>
                      <input
                        type="number"
                        min={0}
                        max={5000}
                        value={sizes.find((s) => s.size === size)?.qty ?? 0}
                        onChange={(event) => setSizeQty(size, Number(event.target.value))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="field">Print method</label>
              <select
                value={printMethod}
                onChange={(event) => setPrintMethod(event.target.value as PrintMethod)}
              >
                <option value="DTF">DTF</option>
                <option value="VINYL">Vinyl</option>
                <option value="EMBROIDERY">Embroidery (flagged for manual digitizing)</option>
              </select>
            </div>

            <hr />
            <div className="row spread">
              <span className="muted">Quantity</span>
              <strong>{quantity}</strong>
            </div>
            <div className="row spread">
              <span className="muted">Unit price</span>
              <strong>{quote ? formatPaise(quote.unitPricePaise) : '—'}</strong>
            </div>
            <div className="row spread">
              <span className="muted">Estimated total</span>
              <strong>{quote ? formatPaise(quote.lineTotalPaise) : '—'}</strong>
            </div>
            {quote?.provisional ? (
              <span className="pill warn">Placeholder pricing — real tiers pending D3</span>
            ) : null}

            {error ? <div className="error-box">{error}</div> : null}
            {message ? <div className="ok-box">{message}</div> : null}

            <button className="primary" onClick={addToCart} disabled={designLayerCount === 0}>
              Add to cart
            </button>
            {designLayerCount === 0 ? (
              <p className="tiny muted">Add text or artwork to make this design printable.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
