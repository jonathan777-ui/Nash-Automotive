export interface ProposalViewedInput {
  opportunityId: string;
}

export interface ProposalViewedResult {
  ok: boolean;
  status: number;
}

export interface ProposalViewedDeps {
  n8nProposalViewedWebhookUrl: string;
  fetchImpl?: typeof fetch;
}

/** 06's audit-gap list ("portal abandonment: targeted follow-up on incomplete e-sign") needs a real
 * signal for "the proposal was actually opened" before a follow-up workflow can tell abandonment
 * apart from a lead who was never sent the link at all. This is a fire-and-forget beacon, not a
 * gated action like submitEsign - a failed/unreachable webhook here shouldn't block the proposal
 * page from rendering, so the caller (proposal.html) doesn't even wait on the response. */
export async function recordProposalViewed(
  input: ProposalViewedInput,
  deps: ProposalViewedDeps,
): Promise<ProposalViewedResult> {
  if (!input.opportunityId?.trim()) return { ok: false, status: 400 };

  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(deps.n8nProposalViewedWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityId: input.opportunityId }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 502 };
  }
}
