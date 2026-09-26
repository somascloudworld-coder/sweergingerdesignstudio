'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Preview } from '@/components/Preview';
import { formatPaise } from '@/lib/pricing';
import { useStudio } from '@/lib/store';
import type { PrintArea, PrintMethod } from '@/lib/types';

export default function CartPage() {
  const cart = useStudio((s) => s.cart);
  const hydrated = useStudio((s) => s.hydrated);
  const removeFromCart = useStudio((s) => s.removeFromCart);
  const updateLineMethod = useStudio((s) => s.updateLineMethod);

  const [totals, setTotals] = useState<{
    subtotalPaise: number;
    anyProvisional: boolean;
    lines: { lineTotalPaise: number }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(
    () =>
      cart.map((line) => ({
        lineId: line.lineId,
        productId: line.productId,
        variantId: line.variantId,
        printMethod: line.printMethod,
        sizes: line.sizes,
      })),
    [cart],
  );

  useEffect(() => {
    if (!hydrated || payload.length === 0) {
      setTotals(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/orders/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lines: payload }),
        });
        const body = await response.json();
        if (!response.ok) {
          if (!cancelled) setError(body.error ?? 'Could not price the cart.');
          return;
        }
        if (!cancelled) {
          setError(null);
          setTotals(body);
        }
      } catch {
        if (!cancelled) setError('Could not price the cart.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload, hydrated]);

  if (!hydrated) return <div className="wrap">Loading the cart…</div>;

  return (
    <div className="wrap">
      <h1>Your cart</h1>
      <p className="sub">Each line holds the design exactly as it was when added.</p>

      {cart.length === 0 ? (
        <div className="card">
          <p className="muted">
            Your cart is empty. <Link href="/">Design a T-shirt</Link> to start.
          </p>
        </div>
      ) : (
        <div className="stack">
          {cart.map((line) => {
            const area: PrintArea = {
              id: 'cart',
              productId: line.productId,
              side: 'front',
              x: 0,
              y: 0,
              width: line.area.width,
              height: line.area.height,
              units: 'px',
              provisional: true,
            };
            const quantity = line.sizes.reduce((sum, s) => sum + s.qty, 0);
            return (
              <div className="card" key={line.lineId}>
                <div className="row spread" style={{ alignItems: 'flex-start' }}>
                  <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
                    <Preview
                      colourHex={line.colourHex}
                      garmentPath={line.garmentPath}
                      area={{ ...area, width: line.area.width, height: line.area.height }}
                      layers={line.designSides.front}
                      maxWidth={120}
                    />
                    <div>
                      <h3>{line.productName}</h3>
                      <p className="small muted" style={{ margin: '2px 0' }}>
                        {line.colourName} · {quantity} pc
                        {quantity === 1 ? '' : 's'} ·{' '}
                        {line.sizes.filter((s) => s.qty > 0).map((s) => `${s.size}×${s.qty}`).join(', ')}
                      </p>
                      <div className="row" style={{ marginTop: 8 }}>
                        <label className="field" style={{ marginBottom: 0 }}>
                          Print method
                        </label>
                        <select
                          value={line.printMethod}
                          style={{ width: 200 }}
                          onChange={(e) =>
                            updateLineMethod(line.lineId, e.target.value as PrintMethod)
                          }
                        >
                          <option value="DTF">DTF</option>
                          <option value="VINYL">Vinyl</option>
                          <option value="EMBROIDERY">Embroidery</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>
                      {totals?.lines[cart.indexOf(line)]
                        ? formatPaise(totals.lines[cart.indexOf(line)].lineTotalPaise)
                        : '—'}
                    </strong>
                    <div style={{ marginTop: 8 }}>
                      <button className="ghost" onClick={() => removeFromCart(line.lineId)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="card">
            {error ? <div className="error-box">{error}</div> : null}
            <div className="row spread">
              <span className="muted">Subtotal</span>
              <strong>{totals ? formatPaise(totals.subtotalPaise) : '—'}</strong>
            </div>
            {totals?.anyProvisional ? (
              <p className="tiny" style={{ marginTop: 6 }}>
                <span className="pill warn">Placeholder pricing — real tiers pending D3</span>
              </p>
            ) : null}
            <hr />
            <Link href="/checkout">
              <button className="primary">Continue to checkout</button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
