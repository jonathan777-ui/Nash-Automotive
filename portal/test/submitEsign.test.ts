import { describe, expect, it, vi } from 'vitest';
import { submitEsign } from '../netlify/functions/lib/submitEsign.js';

const validInput = { opportunityId: 'opp-1', typedName: 'Jonathan Doe', checked: true };
const fixedNow = () => new Date('2026-08-24T12:00:00.000Z');

describe('submitEsign', () => {
  it('rejects when the checkbox is not checked, without calling the webhook', async () => {
    const fetchImpl = vi.fn();
    const result = await submitEsign(
      { ...validInput, checked: false },
      '203.0.113.5',
      { n8nEsignWebhookUrl: 'https://n8n.example.com/webhook/esign', fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a blank typed name', async () => {
    const result = await submitEsign({ ...validInput, typedName: '  ' }, '203.0.113.5', {
      n8nEsignWebhookUrl: 'https://n8n.example.com/webhook/esign',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a missing opportunity id', async () => {
    const result = await submitEsign({ ...validInput, opportunityId: '' }, '203.0.113.5', {
      n8nEsignWebhookUrl: 'https://n8n.example.com/webhook/esign',
    });
    expect(result.ok).toBe(false);
  });

  it('posts the server-captured timestamp and IP (not anything the client could supply) to n8n', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const result = await submitEsign(validInput, '203.0.113.5', {
      n8nEsignWebhookUrl: 'https://n8n.example.com/webhook/esign',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: fixedNow,
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://n8n.example.com/webhook/esign',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          opportunityId: 'opp-1',
          typedName: 'Jonathan Doe',
          checked: true,
          timestampIso: '2026-08-24T12:00:00.000Z',
          ip: '203.0.113.5',
        }),
      }),
    );
  });

  it('fails cleanly when the n8n webhook itself returns an error status', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    const result = await submitEsign(validInput, '203.0.113.5', {
      n8nEsignWebhookUrl: 'https://n8n.example.com/webhook/esign',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
  });
});
