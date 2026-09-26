import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeBackend, renderBackendMessage, SUPABASE_VARS } from '@/lib/diagnostics';

const SAVED = { ...process.env };

function clearBackendEnv() {
  delete process.env.DATA_BACKEND;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.NETLIFY;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  for (const name of SUPABASE_VARS) delete process.env[name];
}

beforeEach(() => {
  clearBackendEnv();
});

afterEach(() => {
  process.env = { ...SAVED };
});

describe('backend selection', () => {
  it('defaults to local with no configuration', () => {
    const diagnostics = describeBackend();
    expect(diagnostics.selected).toBe('local');
    expect(diagnostics.serverless).toBe(false);
  });

  it('chooses supabase when DATA_BACKEND says so', () => {
    process.env.DATA_BACKEND = 'supabase';
    expect(describeBackend().selected).toBe('supabase');
  });

  it('honours an explicit local even when Supabase variables are present', () => {
    process.env.DATA_BACKEND = 'local';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    const diagnostics = describeBackend();
    expect(diagnostics.selected).toBe('local');
    expect(diagnostics.missing).toEqual([]);
  });

  it('infers supabase when the three variables are present and nothing is pinned', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    const diagnostics = describeBackend();
    expect(diagnostics.selected).toBe('supabase');
    expect(diagnostics.supabaseHost).toBe('example.supabase.co');
  });

  it('treats an unknown DATA_BACKEND value as local and says so', () => {
    process.env.DATA_BACKEND = 'postgres';
    const diagnostics = describeBackend();
    expect(diagnostics.selected).toBe('local');
    expect(diagnostics.reason).toContain('not a known backend');
  });

  it('reports which variables are missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    const diagnostics = describeBackend();
    expect(diagnostics.missing).toEqual([
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]);
  });

  it('detects a managed host and its environment name', () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    const diagnostics = describeBackend();
    expect(diagnostics.serverless).toBe(true);
    expect(diagnostics.runtime).toBe('vercel');
    expect(diagnostics.deploymentEnv).toBe('preview');
  });
});

describe('the message', () => {
  it('never prints a secret value', () => {
    process.env.VERCEL = '1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SUPERSECRET';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'SERVICE_ROLE_SUPERSECRET';
    const message = renderBackendMessage(describeBackend());
    expect(message).not.toContain('SUPERSECRET');
    expect(message).toContain('present');
  });

  it('names the variable that is missing', () => {
    process.env.VERCEL = '1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    const message = renderBackendMessage(describeBackend());
    expect(message).toContain('SUPABASE_SERVICE_ROLE_KEY             MISSING');
    expect(message).toContain('Missing here: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY');
  });

  it('points at the preview-vs-production trap when a preview deployment lacks the variables', () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    const message = renderBackendMessage(describeBackend());
    expect(message).toContain('not Production');
    expect(message).toContain('Scope it to All Environments');
  });

  it('tells you the one thing left when everything else is correct', () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    process.env.DATA_BACKEND = 'local';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    const message = renderBackendMessage(describeBackend());
    expect(message).toContain('DATA_BACKEND is pinned to "local"');
    expect(message).toContain('Change DATA_BACKEND to "supabase"');
  });
});
