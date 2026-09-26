import { NextResponse } from 'next/server';
import { getRepo, resetRepoCache } from '@/lib/db';
import { describeBackend } from '@/lib/diagnostics';

export const dynamic = 'force-dynamic';

/**
 * Deployment self-check.
 *
 * Reports configuration PRESENCE, never a value: no key, token or connection string is
 * echoed. It answers the question a setup screen can only hint at — did the variables
 * reach this process, and is this a Production or a Preview deployment?
 */
export async function GET() {
  const diagnostics = describeBackend();

  let database: { reachable: boolean; products?: number; error?: string };
  try {
    // Probe fresh, so a cached failure does not hide a now-correct configuration.
    resetRepoCache();
    const repo = await getRepo();
    const products = await repo.listProducts();
    database = { reachable: true, products: products.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    database = { reachable: false, error: message.slice(0, 1200) };
  }

  return NextResponse.json(
    {
      ok: database.reachable,
      backend: {
        selected: diagnostics.selected,
        reason: diagnostics.reason,
        dataBackend: diagnostics.dataBackendRaw || null,
        supabaseHost: diagnostics.supabaseHost,
      },
      environment: {
        runtime: diagnostics.runtime,
        serverless: diagnostics.serverless,
        deploymentEnv: diagnostics.deploymentEnv,
        gitRef: diagnostics.gitRef,
      },
      // Presence only. Never the value.
      variables: diagnostics.required,
      missing: diagnostics.missing,
      database,
    },
    { status: database.reachable ? 200 : 503 },
  );
}
