'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Sign-in failed.');
        return;
      }
      router.replace('/admin/orders');
    } catch {
      setError('Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card" style={{ maxWidth: 400, margin: '48px auto' }}>
        <h1>Staff sign-in</h1>
        <p className="sub">The order queue and production status are staff-only.</p>
        <div className="stack">
          <div>
            <label className="field">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="field">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
          </div>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
