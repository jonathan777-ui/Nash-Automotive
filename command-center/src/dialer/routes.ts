import { escapeHtml } from '../util.js';
import { decodeCallState, encodeCallState } from './state.js';
import { getNextCall, lookupRep, placeCall, wrapUpCall, type ActiveCallState, type DialerDeps } from './n8nClient.js';

const DISPOSITIONS = [
  'Connected-Interested',
  'Connected-NotInterested',
  'Callback',
  'NoAnswer',
  'Busy',
  'GatekeeperOnly',
  'WrongNumber',
  'VoicemailLeft',
  'OptOut',
];

const PAGE_STYLE = `
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a1628; color: #eaf3fb;
         margin: 0; padding: 32px 20px; }
  .shell { max-width: 640px; margin: 0 auto; }
  .card { padding: 20px 24px; border: 1px solid #1c2c42; border-radius: 16px; background: #0c1726;
          margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .nav { font-size: 12px; margin-bottom: 20px; }
  .nav a { color: #7fe0ff; text-decoration: none; margin-right: 14px; }
  .hint { color: #52688a; font-size: 12px; margin: 0 0 16px; }
  label { display: block; font-size: 12px; color: #90b3cf; margin: 12px 0 4px; }
  input[type=text], input[type=datetime-local], select, textarea {
    width: 100%; background: #0a1422; border: 1px solid #1c2c42; border-radius: 8px;
    padding: 8px 10px; color: #eaf3fb; font-size: 13px; box-sizing: border-box; }
  textarea { min-height: 70px; resize: vertical; }
  button { background: linear-gradient(160deg,#1fb6ff,#0a8fd6); color: #04121f; font-weight: 700;
         border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; cursor: pointer;
         margin-top: 14px; }
  button.secondary { background: #0a1422; color: #90b3cf; border: 1px solid #1c2c42; }
  .banner { border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
  .banner.err { background: rgba(251,113,133,.12); border: 1px solid rgba(251,113,133,.35); color: #fda4af; }
  .banner.ok { background: rgba(45,212,191,.12); border: 1px solid rgba(45,212,191,.35); color: #7fe8db; }
  .banner.warn { background: rgba(246,166,9,.12); border: 1px solid rgba(246,166,9,.35); color: #f6a609; }
  .field-row { display: flex; gap: 10px; }
  .field-row > div { flex: 1; }
  .meta { color: #52688a; font-size: 12px; margin-top: 4px; }
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

function idleForm(params: { emptyMessage?: string; errorMessage?: string }): string {
  return `
    ${params.errorMessage ? `<div class="banner err">${escapeHtml(params.errorMessage)}</div>` : ''}
    ${params.emptyMessage ? `<div class="banner warn">${escapeHtml(params.emptyMessage)}</div>` : ''}
    <div class="card">
      <h1>Dialer</h1>
      <p class="hint">Claims the next eligible HopperEntry, subject to the daily attempt cap and
      DNC/compliant-hours gates checked at the moment you dial — this only reserves a lead to call,
      it doesn't place a call yet.</p>
      <form method="post" action="/dialer/next">
        <label for="campaignId">Campaign ID (optional — leave blank to pull from any active campaign)</label>
        <input type="text" id="campaignId" name="campaignId" placeholder="campaign-id">
        <label for="dialerMode">Dialer mode</label>
        <select id="dialerMode" name="dialerMode">
          <option value="Preview">Preview (review before each dial)</option>
          <option value="Power">Power</option>
          <option value="MultiLine">Multi-line</option>
        </select>
        <button type="submit">Get next call</button>
      </form>
    </div>`;
}

function activeCallView(call: ActiveCallState, params: { blocked?: string; dialing?: boolean; recovered?: boolean; wrapError?: string }): string {
  const state = encodeCallState(call);
  return `
    ${params.recovered ? `<div class="banner warn">Resuming a call you already had claimed — submit wrap-up below to continue.</div>` : ''}
    ${params.blocked ? `<div class="banner err">Call not placed: ${escapeHtml(params.blocked)}</div>` : ''}
    ${params.dialing ? `<div class="banner ok">Dialing…</div>` : ''}
    ${params.wrapError ? `<div class="banner err">${escapeHtml(params.wrapError)}</div>` : ''}
    <div class="card">
      <h1>${escapeHtml(call.companyName)}</h1>
      <p class="meta">${call.phone ? escapeHtml(call.phone) : 'No phone on file for this Location'} · ${escapeHtml(call.dialerMode)} mode · wave ${call.wave}, attempt ${call.attemptCountThisWave + 1}</p>
      <form method="post" action="/dialer/place-call">
        <input type="hidden" name="state" value="${escapeHtml(state)}">
        <button type="submit" ${call.phone ? '' : 'disabled'}>Place call</button>
      </form>
    </div>
    <div class="card">
      <h1>Call wrap-up</h1>
      <p class="hint">Required before the next call can be claimed — Call Note and Disposition are
      both mandatory (Callback/Try-back date-time is optional), per W3.6.</p>
      <form method="post" action="/dialer/wrap-up">
        <input type="hidden" name="state" value="${escapeHtml(state)}">
        <label for="callNote">Call note</label>
        <textarea id="callNote" name="callNote" required></textarea>
        <label for="disposition">Disposition</label>
        <select id="disposition" name="disposition" required>
          <option value="">Select one…</option>
          ${DISPOSITIONS.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
        </select>
        <label for="scheduledAt">Callback date/time (only for Callback)</label>
        <input type="datetime-local" id="scheduledAt" name="scheduledAt">
        <button type="submit">Submit wrap-up</button>
      </form>
    </div>`;
}

export async function handleDialerPage(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const stateParam = url.searchParams.get('state');
  const call = stateParam ? decodeCallState(stateParam) : null;

  const body = call
    ? activeCallView(call, {
        blocked: url.searchParams.get('blocked') ?? undefined,
        dialing: url.searchParams.get('dialing') === '1',
        recovered: url.searchParams.get('recovered') === '1',
        wrapError: url.searchParams.get('wrapError') ?? undefined,
      })
    : idleForm({
        emptyMessage: url.searchParams.get('empty') ?? undefined,
        errorMessage: url.searchParams.get('error') ?? undefined,
      });

  return new Response(pageShell('Dialer', body), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function handleGetNextCall(request: Request, deps: DialerDeps, viewerEmail: string): Promise<Response> {
  const form = await request.formData();
  const campaignId = String(form.get('campaignId') ?? '').trim() || undefined;
  const dialerMode = String(form.get('dialerMode') ?? 'Preview');

  const repResult = await lookupRep(viewerEmail, deps);
  if (!repResult.ok || !repResult.rep) {
    return redirectDialer(request, { error: repResult.reason ?? 'Could not resolve your Rep profile.' });
  }

  const result = await getNextCall(repResult.rep, { repId: repResult.rep.id, campaignId, dialerMode }, deps);
  if (!result.ok) {
    if (result.empty) return redirectDialer(request, { empty: result.reason ?? 'No calls available right now.' });
    return redirectDialer(request, { error: result.reason ?? 'Could not get the next call.' });
  }

  return redirectDialer(request, { state: encodeCallState(result.call!), recovered: result.recovered });
}

export async function handlePlaceCall(request: Request, deps: DialerDeps): Promise<Response> {
  const form = await request.formData();
  const stateParam = String(form.get('state') ?? '');
  const call = decodeCallState(stateParam);
  if (!call) return redirectDialer(request, { error: 'Lost track of the active call — get the next call again.' });

  const result = await placeCall(call, deps);
  if (!result.ok) return redirectDialer(request, { state: stateParam, blocked: result.reason });
  return redirectDialer(request, { state: stateParam, dialing: true });
}

export async function handleWrapUpCall(request: Request, deps: DialerDeps): Promise<Response> {
  const form = await request.formData();
  const stateParam = String(form.get('state') ?? '');
  const call = decodeCallState(stateParam);
  if (!call) return redirectDialer(request, { error: 'Lost track of the active call — get the next call again.' });

  const callNote = String(form.get('callNote') ?? '').trim();
  const disposition = String(form.get('disposition') ?? '');
  const scheduledAt = String(form.get('scheduledAt') ?? '').trim() || undefined;

  if (!callNote || !disposition) {
    return redirectDialer(request, { state: stateParam, wrapError: 'Call Note and Disposition are both required.' });
  }

  const result = await wrapUpCall(call, { callNote, disposition, scheduledAt }, deps);
  if (!result.ok) {
    return redirectDialer(request, { state: stateParam, wrapError: result.reason ?? 'Could not submit wrap-up.' });
  }
  return redirectDialer(request, {});
}

function redirectDialer(
  request: Request,
  params: { state?: string; error?: string; empty?: string; blocked?: string; dialing?: boolean; recovered?: boolean; wrapError?: string },
): Response {
  const url = new URL('/dialer', request.url);
  if (params.state) url.searchParams.set('state', params.state);
  if (params.error) url.searchParams.set('error', params.error);
  if (params.empty) url.searchParams.set('empty', params.empty);
  if (params.blocked) url.searchParams.set('blocked', params.blocked);
  if (params.dialing) url.searchParams.set('dialing', '1');
  if (params.recovered) url.searchParams.set('recovered', '1');
  if (params.wrapError) url.searchParams.set('wrapError', params.wrapError);
  return Response.redirect(url.toString(), 303);
}
