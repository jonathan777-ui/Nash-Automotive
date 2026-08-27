import { describe, expect, it, vi } from 'vitest';
import { pushFieldValue, type Env } from '../src/index.js';
import type { CredentialField } from '../src/vendors.js';

const baseEnv: Env = {
  ACCESS_PASSWORD: 'team-password',
  SESSION_SECRET: 'session-secret',
  STATUS: {} as KVNamespace,
  MESSAGING_DB: {} as D1Database,
  ALERTS_INGEST_SECRET: 'secret',
  N8N_INSTANCE_URL: 'https://n8n.example.com',
  CF_WORKER_SCRIPT_NAME: 'orbit-command-center',
  CF_ACCOUNT_ID: 'acct-1',
  CF_SECRETS_STORE_ID: 'store-1',
  CF_API_TOKEN: 'cf-token',
};

describe('pushFieldValue', () => {
  it('does nothing (returns no notes) for a field with no selfBind/pushTargets', async () => {
    const field: CredentialField = { key: 'key', label: 'API key', secretName: 'SOME_KEY' };
    const notes = await pushFieldValue(baseEnv, field, 'value', vi.fn() as unknown as typeof fetch);
    expect(notes).toEqual([]);
  });

  it('binds the value to the Worker when selfBind is set', async () => {
    const field: CredentialField = { key: 'key', label: 'n8n API key', secretName: 'N8N_API_KEY', selfBind: true };
    const fetchImpl = vi.fn(async () => new Response('{"success":true}', { status: 200 })) as unknown as typeof fetch;
    const notes = await pushFieldValue(baseEnv, field, 'value', fetchImpl);
    expect(notes).toEqual(['bound to this Worker for future pushes']);
  });

  it('reports n8n as not-connected-yet when N8N_API_KEY is not bound', async () => {
    const field: CredentialField = {
      key: 'key',
      label: 'Claude API key',
      secretName: 'CLAUDE_API_KEY',
      pushTargets: { n8nCredential: { name: 'Claude API', type: 'httpHeaderAuth', buildData: (v) => ({ name: 'x-api-key', value: v }) } },
    };
    const fetchImpl = vi.fn();
    const notes = await pushFieldValue(baseEnv, field, 'sk-ant-1', fetchImpl as unknown as typeof fetch);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/not connected yet/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('pushes to n8n once N8N_API_KEY is bound', async () => {
    const envWithN8n: Env = { ...baseEnv, N8N_API_KEY: 'n8n-key-1' };
    const field: CredentialField = {
      key: 'key',
      label: 'Claude API key',
      secretName: 'CLAUDE_API_KEY',
      pushTargets: { n8nCredential: { name: 'Claude API', type: 'httpHeaderAuth', buildData: (v) => ({ name: 'x-api-key', value: v }) } },
    };
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === undefined ? new Response('[]', { status: 200 }) : new Response('{}', { status: 200 }),
    ) as unknown as typeof fetch;
    const notes = await pushFieldValue(envWithN8n, field, 'sk-ant-1', fetchImpl);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/pushed to n8n as "Claude API"/);
  });

  it('reports Netlify as not-connected-yet when Netlify fields are not bound', async () => {
    const field: CredentialField = { key: 'secretKey', label: 'Stripe secret key', secretName: 'STRIPE_SECRET_KEY', pushTargets: { netlifyEnvVar: 'STRIPE_SECRET_KEY' } };
    const fetchImpl = vi.fn();
    const notes = await pushFieldValue(baseEnv, field, 'sk_live_1', fetchImpl as unknown as typeof fetch);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/Netlify not connected yet/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('pushes to Netlify once the Netlify fields are bound', async () => {
    const envWithNetlify: Env = { ...baseEnv, NETLIFY_ACCESS_TOKEN: 'nf-token', NETLIFY_ACCOUNT_SLUG: 'orbit-ai', NETLIFY_SITE_ID: 'site-1' };
    const field: CredentialField = { key: 'secretKey', label: 'Stripe secret key', secretName: 'STRIPE_SECRET_KEY', pushTargets: { netlifyEnvVar: 'STRIPE_SECRET_KEY' } };
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const notes = await pushFieldValue(envWithNetlify, field, 'sk_live_1', fetchImpl);
    expect(notes).toEqual(['pushed to Netlify as STRIPE_SECRET_KEY']);
  });

  it('reports both n8n and Netlify pushes for a field with both targets', async () => {
    const envBothBound: Env = { ...baseEnv, N8N_API_KEY: 'n8n-key-1', NETLIFY_ACCESS_TOKEN: 'nf-token', NETLIFY_ACCOUNT_SLUG: 'orbit-ai', NETLIFY_SITE_ID: 'site-1' };
    const field: CredentialField = {
      key: 'key',
      label: 'Twenty CRM API token',
      secretName: 'TWENTY_CRM_API_KEY',
      pushTargets: {
        n8nCredential: { name: 'Twenty CRM API', type: 'httpBearerAuth', buildData: (v) => ({ token: v }) },
        netlifyEnvVar: 'TWENTY_CRM_API_KEY',
      },
    };
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('n8n.example.com') && init?.method === undefined) return new Response('[]', { status: 200 });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const notes = await pushFieldValue(envBothBound, field, 'tok-1', fetchImpl);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/pushed to n8n/);
    expect(notes[1]).toMatch(/pushed to Netlify/);
  });
});
