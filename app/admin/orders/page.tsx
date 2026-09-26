import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminBar } from '@/components/AdminBar';
import { getRepo } from '@/lib/db';
import { formatPaise } from '@/lib/pricing';
import { currentStaff } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  placed: 'Received',
  in_production: 'In production',
  printed: 'Printed',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

export default async function AdminOrdersPage() {
  const staff = await currentStaff();
  if (!staff) redirect('/admin/login');

  const repo = await getRepo();
  const orders = await repo.listOrders();

  return (
    <div className="wrap">
      <AdminBar email={staff.email} />
      <h1 style={{ marginTop: 16 }}>Order queue</h1>
      <p className="sub">
        Every placed order with its frozen design. {orders.length} order
        {orders.length === 1 ? '' : 's'}.
      </p>

      {orders.length === 0 ? (
        <div className="card">
          <p className="muted">No orders yet.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Items</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Status</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const quantity = order.lines.reduce(
                  (sum, line) => sum + line.sizes.reduce((s, x) => s + x.qty, 0),
                  0,
                );
                return (
                  <tr key={order.id} className="clickable">
                    <td>
                      <Link href={`/admin/orders/${order.publicId}`}>{order.publicId}</Link>
                    </td>
                    <td>
                      {order.customer.name}
                      <div className="tiny muted">{order.customer.phone}</div>
                    </td>
                    <td>{order.orderType}</td>
                    <td>
                      {order.lines.map((line) => (
                        <div key={line.id} className="tiny">
                          {line.colourName} · {line.printMethod} ·{' '}
                          {line.sizes.filter((s) => s.qty > 0).map((s) => `${s.size}×${s.qty}`).join(', ')}
                        </div>
                      ))}
                    </td>
                    <td>{quantity}</td>
                    <td>{formatPaise(order.totalPaise)}</td>
                    <td>
                      <span className="pill">{STATUS_LABELS[order.status] ?? order.status}</span>
                    </td>
                    <td className="tiny">
                      {new Date(order.createdAt).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
