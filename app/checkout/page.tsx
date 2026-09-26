'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { formatPaise } from '@/lib/pricing';
import { useStudio } from '@/lib/store';

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useStudio((s) => s.cart);
  const hydrated = useStudio((s) => s.hydrated);
  const clearCart = useStudio((s) => s.clearCart);

  const [orderType, setOrderType] = useState<'B2C' | 'B2B'>('B2C');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    company: '',
    gstin: '',
  });

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
    if (!hydrated || payload.length === 0) return;
    void (async () => {
      const response = await fetch('/api/orders/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines: payload }),
      });
      if (response.ok) {
        const body = (await response.json()) as { totalPaise: number };
        setTotal(body.totalPaise);
      }
    })();
  }, [payload, hydrated]);

  function field(key: keyof typeof form, label: string, type = 'text') {
    return (
      <div>
        <label className="field">{label}</label>
        <input
          type={type}
          value={form[key]}
          onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        />
      </div>
    );
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderType,
          customer: {
            name: form.name,
            phone: form.phone,
            email: form.email,
            address: form.address,
            company: orderType === 'B2B' ? form.company : undefined,
            gstin: orderType === 'B2B' ? form.gstin : undefined,
          },
          lines: cart.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            printMethod: line.printMethod,
            sizes: line.sizes,
            designSides: line.designSides,
            designPublicId: line.designPublicId,
          })),
        }),
      });
      const body = (await response.json()) as { publicId?: string; error?: string };
      if (!response.ok || !body.publicId) {
        setError(body.error ?? 'The order could not be placed.');
        return;
      }
      clearCart();
      router.push(`/order/${body.publicId}`);
    } catch {
      setError('The order could not be placed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) return <div className="wrap">Loading…</div>;

  if (cart.length === 0) {
    return (
      <div className="wrap">
        <h1>Checkout</h1>
        <div className="card">
          <p className="muted">Your cart is empty.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1>Checkout</h1>
      <p className="sub">The order is priced on the server; the design is saved with the order.</p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(260px, 1fr)' }}>
        <div className="card stack">
          <div className="row">
            <button
              className={orderType === 'B2C' ? 'selected' : ''}
              onClick={() => setOrderType('B2C')}
            >
              Personal order
            </button>
            <button
              className={orderType === 'B2B' ? 'selected' : ''}
              onClick={() => setOrderType('B2B')}
            >
              Business / bulk order
            </button>
          </div>

          {field('name', 'Full name')}
          {field('phone', 'Phone', 'tel')}
          {field('email', 'Email', 'email')}
          <div>
            <label className="field">Delivery address</label>
            <textarea
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </div>
          {orderType === 'B2B' ? (
            <>
              {field('company', 'Company')}
              {field('gstin', 'GSTIN (optional)')}
            </>
          ) : null}

          <div className="notice-box">
            Payment hand-off is a flagged placeholder: D6 (standalone vs embedded, and where
            checkout lives) is unresolved. This order is recorded with the design attached and
            payment status <strong>placeholder_pending</strong>; no card data is collected.
          </div>

          {error ? <div className="error-box">{error}</div> : null}

          <button className="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
        </div>

        <div className="card">
          <h2>Order summary</h2>
          {cart.map((line) => (
            <div key={line.lineId} className="row spread small" style={{ marginBottom: 6 }}>
              <span>
                {line.productName} · {line.colourName} ·{' '}
                {line.sizes.filter((s) => s.qty > 0).map((s) => `${s.size}×${s.qty}`).join(', ')}
              </span>
            </div>
          ))}
          <hr />
          <div className="row spread">
            <span className="muted">Total</span>
            <strong>{total === null ? '—' : formatPaise(total)}</strong>
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Recalculated on the server when the order is placed.
          </p>
        </div>
      </div>
    </div>
  );
}
