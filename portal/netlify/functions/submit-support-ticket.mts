import type { Context, Config } from '@netlify/functions';
import { submitSupportTicket } from './lib/submitSupportTicket.js';

export default async (req: Request, _context: Context): Promise<Response> => {
  let body: {
    opportunityId?: string;
    contactName?: string;
    contactEmail?: string;
    subject?: string;
    message?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await submitSupportTicket(
    {
      opportunityId: body.opportunityId,
      contactName: body.contactName ?? '',
      contactEmail: body.contactEmail ?? '',
      subject: body.subject ?? '',
      message: body.message ?? '',
    },
    { n8nSupportTicketWebhookUrl: process.env.N8N_SUPPORT_TICKET_WEBHOOK_URL ?? 'PLACEHOLDER_N8N_SUPPORT_TICKET_WEBHOOK_URL' },
  );

  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, reason: result.reason }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true, ticketId: result.ticketId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/submit-support-ticket',
};
