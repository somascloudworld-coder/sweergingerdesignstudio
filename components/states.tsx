export function SetupNeeded({ detail }: { detail?: string }) {
  return (
    <div className="wrap">
      <div className="card" style={{ maxWidth: 680, margin: '40px auto' }}>
        <h1>The studio is not connected to a database</h1>
        <p className="sub">
          The studio could not read its product catalogue. It shows nothing rather than a
          hard-coded stand-in, because a catalogue that is not in a database cannot be trusted
          with a real order.
        </p>
        {detail ? <div className="error-detail">{detail}</div> : null}
        <hr />
        <h3>Local development</h3>
        <p className="small">
          Nothing to configure. On first run the studio creates and seeds a SQLite database at{' '}
          <code>.data/studio.db</code>. If you see this message locally, the process could not
          write to that folder — check <code>STUDIO_DATA_DIR</code>.
        </p>
        <h3>Deployed (this is the likely case on a host)</h3>
        <p className="small">
          A deployed host has no persistent disk, so the local backend is refused on purpose.
          Point the studio at Supabase instead:
        </p>
        <ol className="small">
          <li>
            Create a Supabase project and run <code>supabase-setup.sql</code> in its SQL editor.
          </li>
          <li>
            Set <code>DATA_BACKEND=supabase</code>, <code>NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and a server-side{' '}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> in the host&rsquo;s environment variables.
          </li>
          <li>
            Redeploy. Environment variables are read at build time, so a saved variable alone
            changes nothing.
          </li>
        </ol>
        <p className="tiny muted">
          The service-role key bypasses row-level security. It belongs in server-side environment
          variables only — never in a <code>NEXT_PUBLIC_</code> variable, a URL or client code.
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
