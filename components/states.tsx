export function SetupNeeded({ detail }: { detail?: string }) {
  return (
    <div className="wrap">
      <div className="card" style={{ maxWidth: 640, margin: '40px auto' }}>
        <h1>Studio setup needed</h1>
        <p className="sub">
          The studio could not read its product catalogue. No product is shown rather than a
          hard-coded stand-in.
        </p>
        {detail ? <div className="error-box">{detail}</div> : null}
        <hr />
        <p className="small">
          Local development: the SQLite database is created and seeded automatically at{' '}
          <code>.data/studio.db</code> on first run. If this message appears, the process could not
          write to <code>.data/</code>.
        </p>
        <p className="small">
          Production (Supabase): set <code>DATA_BACKEND=supabase</code> with{' '}
          <code>NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and a server-side{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>, then run <code>supabase-setup.sql</code> in the
          Supabase SQL editor.
        </p>
      </div>
    </div>
  );
}

export function LoadFailed({ message }: { message: string }) {
  return (
    <div className="wrap">
      <div className="card" style={{ maxWidth: 640, margin: '40px auto' }}>
        <h1>Could not load orders</h1>
        <div className="error-box">{message}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card" style={{ maxWidth: 640, margin: '24px auto' }}>
      <h2>{title}</h2>
      <p className="muted">{children}</p>
    </div>
  );
}
