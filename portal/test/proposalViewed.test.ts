import { describe, expect, it, vi } from 'vitest';
import { recordProposalViewed } from '../netlify/functions/lib/proposalViewed.js';

describe('recordProposalViewed', () => {
  it('rejects a missing opportunity id without calling the webhook', async () => {
    const fetchImpl = vi.fn();
    const result = await recordProposalViewed(
      { opportunityId: '' },
      { n8nProposalViewedWebhookUrl: 'https://n8n.example.com/webhook/proposal-viewed', fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts the opportunityId to n8n', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const result = await recordProposalViewed(
      { opportunityId: 'opp-1' },
      { n8nProposalViewedWebhookUrl: 'https://n8n.example.com/webhook/proposal-viewed', fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://n8n.example.com/webhook/proposal-viewed',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ opportunityId: 'opp-1' }) }),
    );
  });

  it('fails cleanly (not a thrown error) when the webhook is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await recordProposalViewed(
      { opportunityId: 'opp-1' },
      { n8nProposalViewedWebhookUrl: 'https://n8n.example.com/webhook/proposal-viewed', fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
  });

  it('reports the webhook status when it returns an error', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    const result = await recordProposalViewed(
      { opportunityId: 'opp-1' },
      { n8nProposalViewedWebhookUrl: 'https://n8n.example.com/webhook/proposal-viewed', fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });
});
