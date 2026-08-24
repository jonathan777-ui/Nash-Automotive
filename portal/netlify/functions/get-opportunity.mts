import type { Context, Config } from '@netlify/functions';
import { getOpportunityForPortal } from './lib/getOpportunity.js';

export default async (req: Request, _context: Context): Promise<Response> => {
  const id = new URL(req.url).searchParams.get('id') ?? '';

  const result = await getOpportunityForPortal(id, {
    twentyCrmBaseUrl: process.env.TWENTY_CRM_BASE_URL ?? '',
    twentyCrmApiKey: process.env.TWENTY_CRM_API_KEY ?? 'PLACEHOLDER_TWENTY_CRM_API_KEY',
  });

  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, reason: result.reason }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, opportunity: result.opportunity }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/opportunity',
};
