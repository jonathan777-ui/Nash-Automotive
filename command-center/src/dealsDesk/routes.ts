import { escapeHtml } from '../util.js';
import { amendContract, getCompanyDetail, searchCompanies, type DealsDeskDeps } from './n8nClient.js';

const PAGE_STYLE = `
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a1628; color: #eaf3fb;
         margin: 0; padding: 32px 20px; }
  .shell { max-width: 720px; margin: 0 auto; }
  .card { padding: 20px 24px; border: 1px solid #1c2c42; border-radius: 16px; background: #0c1726;
          margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .nav { font-size: 12px; margin-bottom: 20px; }
  .nav a { color: #7fe0ff; text-decoration: none; margin-right: 14px; }
  .hint { color: #52688a; font-size: 12px; margin: 0 0 16px; }
  label { display: block; font-size: 12px; color: #90b3cf; margin: 12px 0 4px; }
  input[type=text], input[type=number], select {
    width: 100%; background: #0a1422; border: 1px solid #1c2c42; border-radius: 8px;
    padding: 8px 10px; color: #eaf3fb; font-size: 13px; box-sizing: border-box; }
  button { background: linear-gradient(160deg,#1fb6ff,#0a8fd6); color: #04121f; font-weight: 700;
         border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; cursor: pointer;
         margin-top: 14px; }
  .banner { border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
  .banner.err { background: rgba(251,113,133,.12); border: 1px solid rgba(251,113,133,.35); color: #fda4af; }
  .banner.ok { background: rgba(45,212,191,.12); border: 1px solid rgba(45,212,191,.35); color: #7fe8db; }
  .result-row { border-top: 1px solid #1c2c42; padding: 8px 0; font-size: 13px; }
  .result-row:first-child { border-top: none; }
  .result-row a { color: #7fe0ff; text-decoration: none; }
  .meta { color: #52688a; font-size: 12px; margin-top: 4px; }
  .field-row { display: flex; gap: 10px; }
  .field-row > div { flex: 1; }
`;

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — Orbit Command Center</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="shell">
    <div class="nav"><a href="/">Home</a><a href="/messaging">Team messaging</a><a href="/deals-desk">Deals Desk</a><a href="/dialer">Dialer</a></div>
    ${body}
  </div>
</body>
</html>`;
}

export async function handleDealsDeskPage(request: Request, deps: DealsDeskDeps): Promise<Response> {
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  const amended = url.searchParams.get('amended') === '1';
  const error = url.searchParams.get('error');

  if (companyId) {
    const detail = await getCompanyDetail(companyId, deps);
    if (!detail.ok || !detail.company) {
      return new Response(pageShell('Deals Desk', renderSearchForm('', detail.reason ?? 'Company not found.')), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response(pageShell('Deals Desk', renderDetail(detail.company, detail.contract ?? null, { amended, error: error ?? undefined })), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const q = url.searchParams.get('q') ?? '';
  let results: Awaited<ReturnType<typeof searchCompanies>> | null = null;
  if (q !== '' || url.searchParams.has('q')) {
    results = await searchCompanies(q, deps);
  }

  return new Response(pageShell('Deals Desk', renderSearchForm(q, results && !results.ok ? results.reason : undefined, results?.companies)), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function renderSearchForm(q: string, error?: string, companies?: { id: string; name: string; engagementScore: number | null; currentTier: string | null }[]): string {
  return `
    ${error ? `<div class="banner err">${escapeHtml(error)}</div>` : ''}
    <div class="card">
      <h1>Deals Desk</h1>
      <p class="hint">Search existing clients to amend an active Contract — a Location added/removed
      or a tier change, per 05 §7/§13's "any material change... triggers versioning, not an edit
      in place."</p>
      <form method="get" action="/deals-desk">
        <label for="q">Company name</label>
        <input type="text" id="q" name="q" value="${escapeHtml(q)}" placeholder="Search LiveClient companies…">
        <button type="submit">Search</button>
      </form>
    </div>
    ${companies ? `<div class="card">
      ${
        companies.length
          ? companies
              .map(
                (c) =>
                  `<div class="result-row"><a href="/deals-desk?companyId=${encodeURIComponent(c.id)}">${escapeHtml(c.name)}</a>
                    <div class="meta">${c.currentTier ? escapeHtml(c.currentTier) : 'no tier on file'} · engagement ${c.engagementScore ?? '—'}</div></div>`,
              )
              .join('')
          : '<div class="meta">No LiveClient companies matched.</div>'
      }
    </div>` : ''}`;
}

function renderDetail(
  company: { id: string; name: string; engagementScore: number | null; currentTier: string | null },
  contract: { id: string; locationIds: string[]; totalValue: number; agreementValue: number; tier: string } | null,
  params: { amended: boolean; error?: string },
): string {
  return `
    ${params.amended ? '<div class="banner ok">Contract amended — a new version was created and the old one superseded.</div>' : ''}
    ${params.error ? `<div class="banner err">${escapeHtml(params.error)}</div>` : ''}
    <div class="card">
      <h1>${escapeHtml(company.name)}</h1>
      <p class="meta">${company.currentTier ? escapeHtml(company.currentTier) : 'no tier on file'} · engagement ${company.engagementScore ?? '—'}</p>
      ${
        contract
          ? `<p class="meta">Active Contract ${escapeHtml(contract.id)} — ${contract.locationIds.length} Location(s), tier ${escapeHtml(contract.tier)}, total $${(contract.totalValue / 100).toFixed(2)}</p>`
          : '<p class="meta">No active Contract found for this Company.</p>'
      }
      <p><a href="/deals-desk">&larr; back to search</a></p>
    </div>
    ${
      contract
        ? `<div class="card">
      <h1>Amend Contract</h1>
      <p class="hint">Creates a NEW Contract version and supersedes this one — never an edit in
      place, per the spec. Provide the full updated set of Location IDs (not a delta) and the
      Opportunity ID for the expansion deal driving this change.</p>
      <form method="post" action="/deals-desk/amend">
        <input type="hidden" name="companyId" value="${escapeHtml(company.id)}">
        <input type="hidden" name="oldContractId" value="${escapeHtml(contract.id)}">
        <label for="opportunityId">Opportunity ID (the expansion deal)</label>
        <input type="text" id="opportunityId" name="opportunityId" required>
        <label for="newLocationIds">Location IDs (comma-separated, full updated set)</label>
        <input type="text" id="newLocationIds" name="newLocationIds" value="${escapeHtml(contract.locationIds.join(', '))}" required>
        <label for="newServiceTier">New tier (leave blank to keep ${escapeHtml(contract.tier)})</label>
        <select id="newServiceTier" name="newServiceTier">
          <option value="">Keep current tier</option>
          <option value="Gold">Gold</option>
          <option value="Platinum">Platinum</option>
          <option value="Iridium">Iridium</option>
        </select>
        <div class="field-row">
          <div>
            <label for="newTotalValueCents">New total value (cents)</label>
            <input type="number" id="newTotalValueCents" name="newTotalValueCents" value="${contract.totalValue}" required>
          </div>
          <div>
            <label for="newAgreementValueCents">New agreement value (cents)</label>
            <input type="number" id="newAgreementValueCents" name="newAgreementValueCents" value="${contract.agreementValue}" required>
          </div>
        </div>
        <button type="submit">Submit amendment</button>
      </form>
    </div>`
        : ''
    }`;
}

export async function handleAmendContract(request: Request, deps: DealsDeskDeps): Promise<Response> {
  const form = await request.formData();
  const companyId = String(form.get('companyId') ?? '');
  const oldContractId = String(form.get('oldContractId') ?? '');
  const opportunityId = String(form.get('opportunityId') ?? '').trim();
  const newLocationIds = String(form.get('newLocationIds') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const newServiceTier = String(form.get('newServiceTier') ?? '').trim() || undefined;
  const newTotalValueCents = Number(form.get('newTotalValueCents'));
  const newAgreementValueCents = Number(form.get('newAgreementValueCents'));

  if (!companyId || !oldContractId || !opportunityId || newLocationIds.length === 0 || !Number.isFinite(newTotalValueCents) || !Number.isFinite(newAgreementValueCents)) {
    return redirectDetail(request, companyId, { error: 'All fields are required, and at least one Location ID must be given.' });
  }

  const result = await amendContract(
    { companyId, oldContractId, opportunityId, newLocationIds, newServiceTier, newTotalValueCents, newAgreementValueCents },
    deps,
  );
  if (!result.ok) return redirectDetail(request, companyId, { error: result.reason ?? 'Could not submit the amendment.' });
  return redirectDetail(request, companyId, { amended: true });
}

function redirectDetail(request: Request, companyId: string, params: { amended?: boolean; error?: string }): Response {
  const url = new URL('/deals-desk', request.url);
  url.searchParams.set('companyId', companyId);
  if (params.amended) url.searchParams.set('amended', '1');
  if (params.error) url.searchParams.set('error', params.error);
  return Response.redirect(url.toString(), 303);
}
