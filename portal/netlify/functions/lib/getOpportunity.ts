/** One Location the Opportunity spans - Front Door Audit and demo status live here, not on the
 * Opportunity, per CRM-OBJECT-MODEL.md (Location is the GBP-driven, per-site object; an Opportunity
 * can span more than one). */
export interface PortalLocation {
  id: string;
  name: string;
  frontDoorAuditStatus?: string;
  frontDoorAuditScore?: number;
  frontDoorAuditReportUrl?: string;
  demoStatus?: string;
}

export interface PortalOpportunity {
  companyName: string;
  stage: string;
  dueDiligenceStatus?: string;
  dueDiligenceReportUrl?: string;
  /** Was flat frontDoorAudit* fields directly on this object before the object model migration -
   * changed to an array once Location became a real object, since a single Opportunity can span
   * multiple Locations, each with its own independent audit result. Portal pages (audit.html
   * especially) need to render per-Location now, not assume there's exactly one. */
  locations: PortalLocation[];
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

function unwrap(body: unknown, ...wrapperKeys: string[]): unknown {
  let current: any = body;
  for (const key of wrapperKeys) {
    if (current && typeof current === 'object' && key in current) current = current[key];
  }
  return current;
}

/** Server-side only — the whole reason this is a Netlify Function rather than the portal page
 * calling Twenty CRM directly is that TWENTY_CRM_API_KEY can never reach the browser. Returns only
 * the fields the portal actually needs to render — never the raw Opportunity/Location records,
 * which may carry fields with no business being shown to a prospect. */
export async function getOpportunityForPortal(
  opportunityId: string,
  deps: GetOpportunityDeps,
): Promise<GetOpportunityResult> {
  if (!opportunityId.trim()) {
    return { ok: false, status: 400, reason: 'Missing opportunity id.' };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${deps.twentyCrmApiKey}` };

  let response: Response;
  try {
    response = await fetchImpl(`${deps.twentyCrmBaseUrl}/rest/opportunities/${encodeURIComponent(opportunityId)}`, {
      headers,
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
  // every workflow in workflows/. Tries both shapes rather than committing to one guess.
  const record = (unwrap(body, 'data', 'opportunity') ?? unwrap(body, 'data') ?? body) as any;
  if (!record || typeof record !== 'object' || typeof record.name !== 'string') {
    return { ok: false, status: 502, reason: 'Unexpected Twenty CRM response shape - could not find the Opportunity record.' };
  }

  const locationIds: string[] = Array.isArray(record.locationIds) ? record.locationIds : [];
  const locations: PortalLocation[] = [];
  for (const locationId of locationIds) {
    try {
      const locRes = await fetchImpl(`${deps.twentyCrmBaseUrl}/rest/locations/${encodeURIComponent(locationId)}`, {
        headers,
      });
      if (!locRes.ok) continue; // best-effort: one bad Location shouldn't fail the whole portal page
      const locBody = await locRes.json();
      const locRecord = (unwrap(locBody, 'data', 'location') ?? unwrap(locBody, 'data') ?? locBody) as any;
      if (locRecord && typeof locRecord === 'object' && typeof locRecord.id === 'string') {
        locations.push({
          id: locRecord.id,
          name: locRecord.name ?? record.name,
          frontDoorAuditStatus: locRecord.frontDoorAuditStatus,
          frontDoorAuditScore: locRecord.frontDoorAuditScore,
          frontDoorAuditReportUrl: locRecord.frontDoorAuditReportUrl,
          demoStatus: locRecord.demoStatus,
        });
      }
    } catch {
      // same best-effort reasoning as the !locRes.ok branch above - skip, don't fail the page
    }
  }

  return {
    ok: true,
    opportunity: {
      companyName: record.name,
      stage: record.stage ?? 'Unknown',
      dueDiligenceStatus: record.dueDiligenceStatus,
      dueDiligenceReportUrl: record.dueDiligenceReportUrl,
      locations,
    },
  };
}
