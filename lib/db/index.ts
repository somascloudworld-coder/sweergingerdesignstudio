import type { Repo } from './repo';

let cached: Promise<Repo> | null = null;

export type BackendName = 'local' | 'supabase';

export function activeBackend(): BackendName {
  const explicit = (process.env.DATA_BACKEND ?? '').trim().toLowerCase();
  if (explicit === 'supabase' || explicit === 'local') return explicit;
  // Default: Supabase only when both server-side keys are present, otherwise local.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 'supabase';
  }
  return 'local';
}

export function getRepo(): Promise<Repo> {
  if (!cached) {
    cached = (async () => {
      if (activeBackend() === 'supabase') {
        const { createSupabaseRepo } = await import('./supabase');
        return createSupabaseRepo();
      }
      const { createSqliteRepo } = await import('./sqlite');
      return createSqliteRepo();
    })();
  }
  return cached;
}
