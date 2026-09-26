'use client';

import { useRouter } from 'next/navigation';

export function AdminBar({ email }: { email: string }) {
  const router = useRouter();
  return (
    <div className="row spread">
      <span className="small muted">Signed in as {email}</span>
      <button
        onClick={async () => {
          await fetch('/api/admin/logout', { method: 'POST' });
          router.replace('/admin/login');
        }}
      >
        Sign out
      </button>
    </div>
  );
}
