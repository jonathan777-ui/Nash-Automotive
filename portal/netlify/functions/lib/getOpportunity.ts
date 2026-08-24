export interface PortalOpportunity {
  companyName: string;
  stage: string;
  dueDiligenceStatus?: string;
  dueDiligenceReportUrl?: string;
  frontDoorAuditStatus?: string;
  frontDoorAuditScore?: number;
  frontDoorAuditReportUrl?: string;
}

export interface GetOpportunitySuccess {
  ok: true;
  opportunity: PortalOpportunity;
}
export interface GetOpportunityFailure {
  ok: false;
  status: number;
  reason: string;
}
export type GetOpportunityResult = GetOpportunitySuccess | GetOpportunityFailure;

export interface GetOpportunityDeps {
  twentyCrmBaseUrl: string;
  twentyCrmApiKey: string;
  fetchImpl?: typeof fetch;
}

/** Server-side only — the whole reason this is a Netlify Function rather than the portal page
 * calling Twenty CRM directly is that TWENTY_CRM_API_KEY can never reach the browser. Returns only
 * the fields the portal actually needs to render (company name, stage, and the Deep Dive Research /
 * Front Door Audit status+link-out pair written by workflows/phase-1-mvp/lead-intake-to-demo-
 * dashboard.workflow.json) - never the raw Opportunity record, which may carry fields with no
 * business being shown to a prospect. */
export async function getOpportunityForPortal(
  opportunityId: string,
  deps: GetOpportunityDeps,
): Promise<GetOpportunityResult> {
  if (!opportunityId.trim()) {
    return { ok: false, status: 400, reason: 'Missing opportunity id.' };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${deps.twentyCrmBaseUrl}/rest/opportunities/${encodeURIComponent(opportunityId)}`, {
      headers: { Authorization: `Bearer ${deps.twentyCrmApiKey}` },
    });
  } catch (err) {
    return { ok: false, status: 502, reason: `Could not reach Twenty CRM: ${(err as Error).message}` };
  }

  if (!response.ok) {
    return { ok: false, status: response.status === 404 ? 404 : 502, reason: `Twenty CRM returned ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: 502, reason: 'Twenty CRM response was not valid JSON.' };
  }

  // UNVERIFIED: assumes Twenty CRM's REST response wraps the record as { data: { opportunity: {...} } }
  // or returns the record directly - same "Twenty CRM's exact REST shape isn't confirmed" caveat as
  // every workflow in workflows/phase-1-mvp/. Tries both shapes rather than committing to one guess.
  const record = (body as any)?.data?.opportunity ?? (body as any)?.data ?? body;
  if (!record || typeof record !== 'object' || typeof record.name !== 'string') {
    return { ok: false, status: 502, reason: 'Unexpected Twenty CRM response shape - could not find the Opportunity record.' };
  }

  return {
    ok: true,
    opportunity: {
      companyName: record.name,
      stage: record.stage ?? 'Unknown',
      dueDiligenceStatus: record.dueDiligenceStatus,
      dueDiligenceReportUrl: record.dueDiligenceReportUrl,
      frontDoorAuditStatus: record.frontDoorAuditStatus,
      frontDoorAuditScore: record.frontDoorAuditScore,
      frontDoorAuditReportUrl: record.frontDoorAuditReportUrl,
    },
  };
}
