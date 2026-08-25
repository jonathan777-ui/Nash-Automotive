/** Pure, unit-tested calls out to `deals-desk-lookup.workflow.json` and
 * `contract-amendment-flow.workflow.json` (`workflows/phase-1-mvp/`) - same "Command Center never
 * talks to Twenty CRM directly" architecture as `dialer/n8nClient.ts`. */

export interface CompanySearchResult {
  id: string;
  name: string;
  engagementScore: number | null;
  currentTier: string | null;
}

export interface Contract {
  id: string;
  companyId: string;
  locationIds: string[];
  status: string;
  totalValue: number;
  agreementValue: number;
  tier: string;
}

export interface Company {
  id: string;
  name: string;
  engagementScore: number | null;
  currentTier: string | null;
}

export interface DealsDeskDeps {
  n8nInstanceUrl: string;
  fetchImpl?: typeof fetch;
}

async function postJson(url: string, body: unknown, fetchImpl: typeof fetch): Promise<{ status: number; body: any }> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed: any = {};
  try {
    parsed = await res.json();
  } catch {
    parsed = { ok: false, reason: `Non-JSON response (status ${res.status}).` };
  }
  return { status: res.status, body: parsed };
}

export interface SearchCompaniesResult {
  ok: boolean;
  companies?: CompanySearchResult[];
  reason?: string;
}

export async function searchCompanies(searchTerm: string, deps: DealsDeskDeps): Promise<SearchCompaniesResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const { status, body } = await postJson(`${deps.n8nInstanceUrl}/webhook/deals-desk-lookup`, { searchTerm }, fetchImpl);
    if (status === 200 && body.ok) return { ok: true, companies: body.companies ?? [] };
    return { ok: false, reason: body.reason ?? `deals-desk-lookup returned ${status}.` };
  } catch (err) {
    return { ok: false, reason: `Could not reach deals-desk-lookup: ${(err as Error).message}` };
  }
}

export interface GetCompanyDetailResult {
  ok: boolean;
  company?: Company;
  contract?: Contract | null;
  reason?: string;
}

export async function getCompanyDetail(companyId: string, deps: DealsDeskDeps): Promise<GetCompanyDetailResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const { status, body } = await postJson(`${deps.n8nInstanceUrl}/webhook/deals-desk-lookup`, { companyId }, fetchImpl);
    if (status === 200 && body.ok) return { ok: true, company: body.company, contract: body.contract ?? null };
    return { ok: false, reason: body.reason ?? `deals-desk-lookup returned ${status}.` };
  } catch (err) {
    return { ok: false, reason: `Could not reach deals-desk-lookup: ${(err as Error).message}` };
  }
}

export interface AmendContractInput {
  companyId: string;
  oldContractId: string;
  opportunityId: string;
  newLocationIds: string[];
  newServiceTier?: string;
  newTotalValueCents: number;
  newAgreementValueCents: number;
}
export interface AmendContractResult {
  ok: boolean;
  newContractId?: string;
  reason?: string;
}

/** contract-amendment-flow.workflow.json - "05 Section 7/13: any material change to an existing
 * Contract... triggers versioning + an Accounting Audit Event, NOT an edit in place." This is the
 * real caller that workflow's own notes have named as missing ("meant to be called by a rep action
 * (Deals Desk, not built)") since it was written. */
export async function amendContract(input: AmendContractInput, deps: DealsDeskDeps): Promise<AmendContractResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const { status, body } = await postJson(`${deps.n8nInstanceUrl}/webhook/contract-amendment`, input, fetchImpl);
    if (status === 200 && body.ok) return { ok: true, newContractId: body.newContractId };
    return { ok: false, reason: body.reason ?? `contract-amendment-flow returned ${status}.` };
  } catch (err) {
    return { ok: false, reason: `Could not reach contract-amendment-flow: ${(err as Error).message}` };
  }
}
