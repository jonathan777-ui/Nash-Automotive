import { describe, expect, it } from 'vitest';
import { handleAlertsIngestAuthed, type Env } from '../src/index.js';
import { FakeD1 } from './messaging/fakeD1.js';

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    ACCESS_PASSWORD: 'x',
    SESSION_SECRET: 'x',
    STATUS: {} as KVNamespace,
    MESSAGING_DB: new FakeD1() as unknown as D1Database,
    ALERTS_INGEST_SECRET: 'real-secret',
    CF_ACCOUNT_ID: 'x',
    CF_SECRETS_STORE_ID: 'x',
    CF_API_TOKEN: 'x',
    ...overrides,
  } as Env;
}

describe('handleAlertsIngestAuthed', () => {
  it('rejects when ALERTS_INGEST_SECRET is still the placeholder', async () => {
    const req = new Request('https://x/api/alerts', {
      method: 'POST',
      headers: { Authorization: 'Bearer PLACEHOLDER_ALERTS_INGEST_SECRET' },
      body: '{}',
    });
    const res = await handleAlertsIngestAuthed(req, baseEnv({ ALERTS_INGEST_SECRET: 'PLACEHOLDER_ALERTS_INGEST_SECRET' }));
    expect(res.status).toBe(401);
  });

  it('rejects a request with the wrong bearer token', async () => {
    const req = new Request('https://x/api/alerts', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong' },
      body: '{}',
    });
    const res = await handleAlertsIngestAuthed(req, baseEnv());
    expect(res.status).toBe(401);
  });

  it('rejects a request with no Authorization header at all', async () => {
    const req = new Request('https://x/api/alerts', { method: 'POST', body: '{}' });
    const res = await handleAlertsIngestAuthed(req, baseEnv());
    expect(res.status).toBe(401);
  });

  it('accepts a request with the correct bearer token and records the alert', async () => {
    const req = new Request('https://x/api/alerts', {
      method: 'POST',
      headers: { Authorization: 'Bearer real-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ severity: 'warning', source: 'test', message: 'hello' }),
    });
    const res = await handleAlertsIngestAuthed(req, baseEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
