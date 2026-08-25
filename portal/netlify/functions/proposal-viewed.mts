import type { Context, Config } from '@netlify/functions';
import { recordProposalViewed, type ProposalViewedInput } from './lib/proposalViewed.js';

export default async (req: Request, _context: Context): Promise<Response> => {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = input as Partial<ProposalViewedInput> | null;
  if (typeof body?.opportunityId !== 'string') {
    return new Response(JSON.stringify({ ok: false, reason: 'Body must be {opportunityId: string}.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await recordProposalViewed(body as ProposalViewedInput, {
    n8nProposalViewedWebhookUrl: process.env.N8N_PROPOSAL_VIEWED_WEBHOOK_URL ?? 'PLACEHOLDER_N8N_PROPOSAL_VIEWED_WEBHOOK_URL',
  });

  return new Response(JSON.stringify({ ok: result.ok }), {
    status: 200, // Always 200 to the browser - this is a fire-and-forget beacon, not something the caller should retry/error on.
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/proposal-viewed',
};
