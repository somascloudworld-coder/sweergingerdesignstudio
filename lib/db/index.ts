import { describeBackend, renderBackendMessage } from '../diagnostics';
import type { Repo } from './repo';

let cached: Promise<Repo> | null = null;

export type BackendName = 'local' | 'supabase';

/** Which backend this process will use, given what it can actually see. */
export function activeBackend(): BackendName {
  return describeBackend().selected;
}

export function getRepo(): Promise<Repo> {
  if (!cached) {
    cached = (async () => {
      const diagnostics = describeBackend();
      if (diagnostics.selected === 'supabase') {
        const { createSupabaseRepo } = await import('./supabase');
        return createSupabaseRepo();
      }
      // Refuse clearly rather than crashing on a read-only file system: a local SQLite
      // file cannot be the system of record on a serverless host.
      if (diagnostics.serverless) {
        throw new Error(renderBackendMessage(diagnostics));
      }
      const { createSqliteRepo } = await import('./sqlite');
      return createSqliteRepo();
    })();
  }
  return cached;
}

/** Clears the cached repository. Used by the health check so it re-reads configuration. */
export function resetRepoCache(): void {
  cached = null;
}
