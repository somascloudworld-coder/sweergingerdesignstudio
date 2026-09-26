'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const STAGES = [
  { value: 'placed', label: 'Received' },
  { value: 'in_production', label: 'In production' },
  { value: 'printed', label: 'Printed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function OrderAdminActions({
  orderPublicId,
  currentStatus,
}: {
  orderPublicId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderPublicId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, note: note || undefined }),
      });
      const body = (await response.json()) as { error?: string; order?: { status: string } };
      if (!response.ok) {
        setError(body.error ?? 'Could not update the status.');
        return;
      }
      setMessage(`Status advanced to ${status.replace(/_/g, ' ')}.`);
      setNote('');
      router.refresh();
    } catch {
      setError('Could not update the status.');
    } finally {
      setBusy(false);
    }
  }

  async function exportPrintFiles() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderPublicId}/export`, { method: 'POST' });
      const body = (await response.json()) as {
        error?: string;
        outputs?: { id: string; widthPx: number; heightPx: number }[];
        dpi?: number;
        notes?: string[];
      };
      if (!response.ok) {
        setError(body.error ?? 'Export failed.');
        return;
      }
      setMessage(
        `Rendered ${body.outputs?.length ?? 0} print file(s) at ${body.dpi} dpi.` +
          (body.notes && body.notes.length ? ` ${body.notes.join(' ')}` : ''),
      );
      router.refresh();
    } catch {
      setError('Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <h2>Production</h2>
      <div className="row">
        <div style={{ flex: '1 1 200px' }}>
          <label className="field">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: '2 1 260px' }}>
          <label className="field">Note (optional)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="primary" onClick={advance} disabled={busy}>
            Advance status
          </button>
        </div>
      </div>

      <hr />

      <div className="row spread">
        <div>
          <h3>Print-ready export</h3>
          <p className="tiny muted" style={{ margin: 0 }}>
            Rendered from the same layers the preview uses. Embroidery is flagged for manual
            digitizing, never auto-digitized.
          </p>
        </div>
        <button onClick={exportPrintFiles} disabled={busy}>
          Generate print files
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="ok-box">{message}</div> : null}
    </div>
  );
}
