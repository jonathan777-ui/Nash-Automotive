import { describe, expect, it, vi } from 'vitest';
import { submitSupportTicket } from '../netlify/functions/lib/submitSupportTicket.js';

const deps = { n8nSupportTicketWebhookUrl: 'https://n8n.example.com/webhook/support-ticket-intake' };

describe('submitSupportTicket', () => {
  it('rejects a missing contact email without calling n8n', async () => {
    const fetchImpl = vi.fn();
    const result = await submitSupportTicket(
      { contactName: 'Jane', contactEmail: '', subject: 'Help', message: 'It is broken' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a missing subject without calling n8n', async () => {
    const fetchImpl = vi.fn();
    const result = await submitSupportTicket(
      { contactName: 'Jane', contactEmail: 'jane@example.com', subject: '', message: 'It is broken' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a missing message without calling n8n', async () => {
    const fetchImpl = vi.fn();
    const result = await submitSupportTicket(
      { contactName: 'Jane', contactEmail: 'jane@example.com', subject: 'Help', message: '' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts a trimmed payload to n8n and returns the ticketId', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ticketId: 't-1' }), { status: 200 }));
    const result = await submitSupportTicket(
      { opportunityId: '  opp-1  ', contactName: '  Jane  ', contactEmail: '  jane@example.com  ', subject: '  Help  ', message: '  It is broken  ' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ticketId).toBe('t-1');
    expect(fetchImpl).toHaveBeenCalledWith(
      deps.n8nSupportTicketWebhookUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          opportunityId: 'opp-1',
          contactName: 'Jane',
          contactEmail: 'jane@example.com',
          subject: 'Help',
          message: 'It is broken',
        }),
      }),
    );
  });

  it('defaults opportunityId to null when omitted', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ticketId: 't-1' }), { status: 200 }));
    await submitSupportTicket(
      { contactName: 'Jane', contactEmail: 'jane@example.com', subject: 'Help', message: 'It is broken' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const init = call[1];
    expect(JSON.parse(init.body as string).opportunityId).toBeNull();
  });

  it('fails cleanly when the network call itself throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await submitSupportTicket(
      { contactName: 'Jane', contactEmail: 'jane@example.com', subject: 'Help', message: 'It is broken' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
  });

  it('fails cleanly on a non-2xx response from n8n', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    const result = await submitSupportTicket(
      { contactName: 'Jane', contactEmail: 'jane@example.com', subject: 'Help', message: 'It is broken' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
  });

  it('fails cleanly when n8n responds 200 without a ticketId', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    const result = await submitSupportTicket(
      { contactName: 'Jane', contactEmail: 'jane@example.com', subject: 'Help', message: 'It is broken' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ticketId/);
  });
});
