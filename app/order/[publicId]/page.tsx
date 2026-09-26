import Link from 'next/link';
import { Preview } from '@/components/Preview';
import { getRepo } from '@/lib/db';
import { formatPaise } from '@/lib/pricing';
import type { PrintArea, ProductVariant, ProductWithDetails } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  placed: 'Received',
  in_production: 'In production',
  printed: 'Printed',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

export default async function OrderPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const repo = await getRepo();
  const order = await repo.getOrder(publicId);

  if (!order) {
    return (
      <div className="wrap">
        <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
          <h1>Order not found</h1>
          <p className="muted">
            No order with reference <code>{publicId}</code>. <Link href="/">Back to the studio</Link>
          </p>
        </div>
      </div>
    );
  }

  const products: ProductWithDetails[] = await repo.listProducts();

  return (
    <div className="wrap">
      <div className="row spread">
        <div>
          <h1>Order {order.publicId}</h1>
          <p className="sub">
            {order.orderType === 'B2B' ? 'Business / bulk' : 'Personal'} order · placed{' '}
            {new Date(order.createdAt).toLocaleDateString('en-IN')}
          </p>
        </div>
        <span className="pill ok">{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>

      <div className="stack">
        {order.lines.map((line) => {
          const product = products.find((p) => p.id === line.productId);
          const variant: ProductVariant | undefined = product?.variants.find(
            (v) => v.id === line.variantId,
          );
          const area: PrintArea | undefined = product?.printAreas.find((a) => a.side === 'front');
          const quantity = line.sizes.reduce((sum, s) => sum + s.qty, 0);
          return (
            <div className="card" key={line.id}>
              <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
                {variant && area ? (
                  <Preview
                    colourHex={variant.colourHex}
                    garmentPath={variant.imagePath}
                    area={{ ...area, width: area.width, height: area.height }}
                    layers={line.designSides.front}
                    maxWidth={130}
                  />
                ) : null}
                <div>
                  <h3>{product?.name ?? line.productId}</h3>
                  <p className="small muted" style={{ margin: '2px 0' }}>
                    {line.colourName} · {line.printMethod} · {quantity} pc
                    {quantity === 1 ? '' : 's'}
                  </p>
                  <p className="small" style={{ margin: '2px 0' }}>
                    {line.sizes.filter((s) => s.qty > 0).map((s) => `${s.size} × ${s.qty}`).join(', ')}
                  </p>
                  <p className="small" style={{ marginTop: 8 }}>
                    {formatPaise(line.unitPricePaise)} × {quantity} ={' '}
                    <strong>{formatPaise(line.lineTotalPaise)}</strong>
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        <div className="card">
          <div className="row spread">
            <span className="muted">Subtotal</span>
            <span>{formatPaise(order.subtotalPaise)}</span>
          </div>
          <div className="row spread">
            <strong>Total</strong>
            <strong>{formatPaise(order.totalPaise)}</strong>
          </div>
          <hr />
          <p className="small muted">
            Payment: {order.paymentStatus.replace(/_/g, ' ')} — {order.checkoutHandoff}
          </p>
          <p className="small muted">
            Delivering to {order.customer.name}, {order.customer.address} · {order.customer.phone}
          </p>
          <p className="tiny muted">
            Your design is saved with this order as editable layers, so it can be re-rendered for
            print at any resolution.
          </p>
        </div>
      </div>
    </div>
  );
}
