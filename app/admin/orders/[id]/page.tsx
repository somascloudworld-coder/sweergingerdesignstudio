import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminBar } from '@/components/AdminBar';
import { OrderAdminActions } from '@/components/OrderAdminActions';
import { Preview } from '@/components/Preview';
import { getRepo } from '@/lib/db';
import { formatPaise } from '@/lib/pricing';
import { currentStaff } from '@/lib/server/auth';
import type { PrintArea, PrintOutput, ProductVariant } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await currentStaff();
  if (!staff) redirect('/admin/login');

  const { id } = await params;
  const repo = await getRepo();
  const order = await repo.getOrder(id);

  if (!order) {
    return (
      <div className="wrap">
        <div className="card" style={{ maxWidth: 520, margin: '40px auto' }}>
          <h1>Order not found</h1>
          <p className="muted">
            <Link href="/admin/orders">Back to the queue</Link>
          </p>
        </div>
      </div>
    );
  }

  const products = await repo.listProducts();
  const outputsByItem = new Map<string, PrintOutput[]>();
  for (const line of order.lines) {
    outputsByItem.set(line.id, await repo.listPrintOutputsForItem(line.id));
  }

  return (
    <div className="wrap">
      <AdminBar email={staff.email} />
      <p className="small" style={{ marginTop: 12 }}>
        <Link href="/admin/orders">← Back to the queue</Link>
      </p>
      <h1>Order {order.publicId}</h1>
      <p className="sub">
        {order.orderType} · {order.customer.name} · {order.customer.phone} ·{' '}
        {new Date(order.createdAt).toLocaleString('en-IN')}
      </p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(260px, 1fr)' }}>
        <div className="stack">
          {order.lines.map((line) => {
            const product = products.find((p) => p.id === line.productId);
            const variant: ProductVariant | undefined = product?.variants.find(
              (v) => v.id === line.variantId,
            );
            const area: PrintArea | undefined = product?.printAreas.find((a) => a.side === 'front');
            const outputs = outputsByItem.get(line.id) ?? [];
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
                      maxWidth={120}
                    />
                  ) : null}
                  <div style={{ flex: 1 }}>
                    <h3>{product?.name ?? line.productId}</h3>
                    <p className="small muted" style={{ margin: '2px 0' }}>
                      {line.colourName} · {line.printMethod} ·{' '}
                      {line.sizes.filter((s) => s.qty > 0).map((s) => `${s.size}×${s.qty}`).join(', ')} ·{' '}
                      {quantity} pc
                    </p>
                    <p className="small" style={{ margin: '2px 0' }}>
                      {formatPaise(line.unitPricePaise)} × {quantity} ={' '}
                      <strong>{formatPaise(line.lineTotalPaise)}</strong>
                    </p>

                    {outputs.length > 0 ? (
                      <div style={{ marginTop: 10 }}>
                        <h3 style={{ marginBottom: 4 }}>Print files</h3>
                        {outputs.map((output) => (
                          <div key={output.id} className="row small" style={{ gap: 8 }}>
                            <a
                              href={`/api/admin/print-outputs/${output.id}?inline=1`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {output.side} · {output.printMethod} · {output.widthPx}×{output.heightPx}{' '}
                              @ {output.dpi}dpi
                            </a>
                            <a href={`/api/admin/print-outputs/${output.id}`}>download</a>
                            {output.manualDigitizingRequired ? (
                              <span className="pill warn">Manual digitizing required</span>
                            ) : null}
                            {output.provisional ? <span className="pill warn">Provisional spec</span> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="tiny muted" style={{ marginTop: 8 }}>
                        No print files generated yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="stack">
          <OrderAdminActions orderPublicId={order.publicId} currentStatus={order.status} />

          <div className="card">
            <h2>Customer</h2>
            <p className="small" style={{ margin: 0 }}>
              {order.customer.name}
              <br />
              {order.customer.phone}
              <br />
              {order.customer.email}
              <br />
              {order.customer.address}
              {order.customer.company ? (
                <>
                  <br />
                  Company: {order.customer.company}
                </>
              ) : null}
              {order.customer.gstin ? (
                <>
                  <br />
                  GSTIN: {order.customer.gstin}
                </>
              ) : null}
            </p>
            <hr />
            <div className="row spread">
              <span className="muted">Total</span>
              <strong>{formatPaise(order.totalPaise)}</strong>
            </div>
            <p className="tiny muted">{order.checkoutHandoff}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
