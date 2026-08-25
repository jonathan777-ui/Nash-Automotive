export interface SupportTicketInput {
  opportunityId?: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  message: string;
}

export interface SubmitSupportTicketSuccess {
  ok: true;
  ticketId: string;
}
export interface SubmitSupportTicketFailure {
  ok: false;
  status: number;
  reason: string;
}
export type SubmitSupportTicketResult = SubmitSupportTicketSuccess | SubmitSupportTicketFailure;

export interface SubmitSupportTicketDeps {
  n8nSupportTicketWebhookUrl: string;
  fetchImpl?: typeof fetch;
}

/** W6.2: "Support ticketing intake... Auto to intake/route; human resolves." Server-side
 * validation mirrors what the n8n side (support-ticket-intake.workflow.json) checks too - belt and
 * suspenders, same reasoning as submitEsign.ts's own comment on this pattern. Synchronous, not a
 * fire-and-forget beacon like proposalViewed.ts - a client submitting a support request reasonably
 * wants to know it was actually received before leaving the page. */
export async function submitSupportTicket(
  input: SupportTicketInput,
  deps: SubmitSupportTicketDeps,
): Promise<SubmitSupportTicketResult> {
  if (!input.contactEmail?.trim()) return { ok: false, status: 400, reason: 'Contact email is required.' };
  if (!input.subject?.trim()) return { ok: false, status: 400, reason: 'Subject is required.' };
  if (!input.message?.trim()) return { ok: false, status: 400, reason: 'Message is required.' };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const payload = {
    opportunityId: input.opportunityId?.trim() || null,
    contactName: input.contactName?.trim() || null,
    contactEmail: input.contactEmail.trim(),
    subject: input.subject.trim(),
    message: input.message.trim(),
  };

  let response: Response;
  try {
    response = await fetchImpl(deps.n8nSupportTicketWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, status: 502, reason: `Could not reach the support intake workflow: ${(err as Error).message}` };
  }

  if (!response.ok) {
    return { ok: false, status: 502, reason: `Support intake workflow returned ${response.status}.` };
  }

  let body: { ticketId?: string };
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: 502, reason: 'Support intake workflow returned an invalid response.' };
  }
  if (!body.ticketId) {
    return { ok: false, status: 502, reason: 'Support intake workflow response was missing a ticketId.' };
  }

  return { ok: true, ticketId: body.ticketId };
}
