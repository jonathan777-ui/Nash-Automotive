import type { Context, Config } from '@netlify/functions';
import { submitEsign, type EsignInput } from './lib/submitEsign.js';

export default async (req: Request, context: Context): Promise<Response> => {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = input as Partial<EsignInput> | null;
  if (
    typeof body?.opportunityId !== 'string' ||
    typeof body?.typedName !== 'string' ||
    typeof body?.checked !== 'boolean'
  ) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'Body must be {opportunityId: string, typedName: string, checked: boolean}.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // UNVERIFIED: Netlify's Context type documents an `ip` field for the connecting client, used
  // here rather than the X-Forwarded-For header (which, behind Netlify's own edge, would just show
  // Netlify's proxy IP, not the visitor's). Not confirmed against a live deployment - if context.ip
  // turns out to be empty/undefined in practice, this falls back to the x-nf-client-connection-ip
  // header Netlify's docs describe elsewhere.
  const clientIp = context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';

  const result = await submitEsign(body as EsignInput, clientIp, {
    n8nEsignWebhookUrl: process.env.N8N_ESIGN_WEBHOOK_URL ?? 'PLACEHOLDER_N8N_ESIGN_WEBHOOK_URL',
  });

  return new Response(JSON.stringify(result.ok ? { ok: true } : { ok: false, reason: result.reason }), {
    status: result.ok ? 200 : result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/esign',
};
