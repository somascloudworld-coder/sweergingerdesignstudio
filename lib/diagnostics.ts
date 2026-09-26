/**
 * Backend diagnostics.
 *
 * Reports which configuration the running process can actually see — never a secret
 * value, only presence. This exists because "the variable is set in the dashboard" and
 * "the variable reached this process" are different claims, and a deployment should be
 * able to say which one is true instead of leaving someone to guess.
 */

export interface EnvPresence {
  name: string;
  present: boolean;
}

export interface BackendDiagnostics {
  serverless: boolean;
  runtime: string;
  /** 'production' | 'preview' | 'development' on Vercel, else null. */
  deploymentEnv: string | null;
  gitRef: string | null;
  selected: 'local' | 'supabase';
  dataBackendRaw: string;
  /** The public project host only. Never a key. */
  supabaseHost: string | null;
  required: EnvPresence[];
  missing: string[];
  reason: string;
}

export const SUPABASE_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/**
 * True on a host where the filesystem is ephemeral or read-only, so a local file
 * database cannot be the system of record.
 */
export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV,
  );
}

function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

export function describeBackend(): BackendDiagnostics {
  const required: EnvPresence[] = SUPABASE_VARS.map((name) => ({
    name,
    present: Boolean(read(name)),
  }));
  const missing = required.filter((entry) => !entry.present).map((entry) => entry.name);
  const credentialsComplete = missing.length === 0;

  const raw = read('DATA_BACKEND').toLowerCase();
  let selected: 'local' | 'supabase';
  let reason: string;

  if (raw === 'supabase') {
    selected = 'supabase';
    reason = 'DATA_BACKEND is set to "supabase".';
  } else if (raw === 'local') {
    selected = 'local';
    reason = 'DATA_BACKEND is explicitly set to "local" in this environment.';
  } else if (credentialsComplete) {
    selected = 'supabase';
    reason = 'DATA_BACKEND is unset, but all three Supabase variables are present.';
  } else if (raw) {
    selected = 'local';
    reason = `DATA_BACKEND is set to "${raw}", which is not a known backend ("local" or "supabase").`;
  } else {
    selected = 'local';
    reason = 'DATA_BACKEND is unset and the Supabase variables are incomplete.';
  }

  const url = read('NEXT_PUBLIC_SUPABASE_URL');
  let supabaseHost: string | null = null;
  if (url) {
    try {
      supabaseHost = new URL(url).host;
    } catch {
      supabaseHost = 'unparseable URL';
    }
  }

  const runtime = process.env.AWS_LAMBDA_FUNCTION_NAME
    ? 'aws-lambda'
    : process.env.VERCEL
      ? 'vercel'
      : process.env.NETLIFY
        ? 'netlify'
        : 'node';

  return {
    serverless: isServerlessRuntime(),
    runtime,
    deploymentEnv: read('VERCEL_ENV') || null,
    gitRef: read('VERCEL_GIT_COMMIT_REF') || null,
    selected,
    dataBackendRaw: raw,
    supabaseHost,
    required,
    missing,
    reason,
  };
}

/** The human-facing explanation shown on the setup screen. Contains no secret values. */
export function renderBackendMessage(diagnostics: BackendDiagnostics): string {
  const lines: string[] = [];

  lines.push('What this deployment actually sees:');
  lines.push(`  backend selected      ${diagnostics.selected}`);
  lines.push(`  DATA_BACKEND          ${diagnostics.dataBackendRaw || '(unset)'}`);
  lines.push(
    `  NEXT_PUBLIC_SUPABASE_URL              ${read('NEXT_PUBLIC_SUPABASE_URL') ? 'present' : 'MISSING'}`,
  );
  lines.push(
    `  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  ${read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ? 'present' : 'MISSING'}`,
  );
  lines.push(
    `  SUPABASE_SERVICE_ROLE_KEY             ${read('SUPABASE_SERVICE_ROLE_KEY') ? 'present' : 'MISSING'}`,
  );
  lines.push(`  environment           ${diagnostics.deploymentEnv ?? '(not a managed host)'}`);
  lines.push(`  runtime               ${diagnostics.runtime}`);
  lines.push(`  reason                ${diagnostics.reason}`);
  lines.push('');

  if (diagnostics.selected === 'local' && diagnostics.serverless) {
    if (diagnostics.dataBackendRaw === 'local' && diagnostics.missing.length === 0) {
      lines.push(
        'Every Supabase variable is present, but DATA_BACKEND is pinned to "local", so the',
        'local backend is being used anyway. Change DATA_BACKEND to "supabase" and redeploy.',
      );
    } else if (diagnostics.missing.length === 0) {
      lines.push(
        'The Supabase variables are all present, so setting DATA_BACKEND=supabase is all that',
        'is left.',
      );
    } else {
      lines.push(
        `Missing here: ${diagnostics.missing.join(', ')}`,
        '',
        'Two things commonly explain a variable that is set in the dashboard but missing here:',
      );
      if (diagnostics.deploymentEnv && diagnostics.deploymentEnv !== 'production') {
        lines.push(
          `  - This deployment is "${diagnostics.deploymentEnv}", not Production. A variable scoped`,
          '    to Production only is not given to a Preview deployment. Scope it to All Environments,',
          '    or promote this deployment to Production.',
        );
      } else {
        lines.push(
          '  - The variable is scoped to a different environment than this deployment.',
          '    Scope it to All Environments.',
        );
      }
      lines.push(
        '  - The variable was added after this deployment was built. Environment variables are',
        '    read at build time, so the deployment must be rebuilt.',
      );
    }
    lines.push('');
    lines.push('This host has no writable, persistent disk, so the local backend cannot persist');
    lines.push('designs, uploads or orders. The app refuses rather than pretending otherwise.');
  }

  lines.push('');
  lines.push('Open /api/health on this deployment for the same diagnosis as JSON.');

  return lines.join('\n');
}
