import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createSecret, type SecretsStoreEnv } from './secretsStore.js';
import { bindWorkerSecret } from './cfWorkerSecrets.js';
import { upsertN8nCredential } from './pushTargets/n8nCredentials.js';
import { setNetlifyEnvVar } from './pushTargets/netlifyEnv.js';
import { VENDORS, type CredentialField, type VendorDef } from './vendors.js';
import { escapeHtml } from './util.js';
import { getAllStatuses, markConnected, type VendorStatus } from './status.js';
import {
  handleAcknowledgeAlert,
  handleAiActionRequestsIngest,
  handleAllocateDemoExtension,
  handleAlertsIngest,
  handleCreateChannel,
  handleMarkNotificationRead,
  handleMessagingPage,
  handleNotificationsIngest,
  handlePostComment,
  handlePostMessage,
  handlePostTagForAction,
  handleResolveAiAction,
  handleThreadPage,
} from './messaging/routes.js';
import { handleDialerPage, handleGetNextCall, handlePlaceCall, handleWrapUpCall } from './dialer/routes.js';
import { handleAmendContract, handleDealsDeskPage } from './dealsDesk/routes.js';

export interface Env extends SecretsStoreEnv {
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  STATUS: KVNamespace;
  /** Real D1 binding — see wrangler.toml. Piece 2's Internal Team Messaging (05 §14). */
  MESSAGING_DB: D1Database;
  /** A plain Wrangler secret (`wrangler secret put ALERTS_INGEST_SECRET`), same treatment as
   * CF_API_TOKEN — n8n's alert-dispatcher workflow authenticates to /api/alerts with this,
   * since it can't complete an interactive Cloudflare Access login. Also gates /api/notifications
   * and /api/ai-action-requests (Tag-for-Action's delivery-layer ingest endpoints, new this pass) -
   * same trust boundary, not a separate secret. */
  ALERTS_INGEST_SECRET: string;
  /** The n8n instance's base URL - Command Center calls OUT to it for Tag-for-Action
   * (POST {N8N_INSTANCE_URL}/webhook/tag-for-action), the one place this Worker itself initiates a
   * call into n8n rather than only receiving pushes from it. Not a Secrets Store entry (an instance
   * URL, not a credential) - same treatment as N8N_INSTANCE_URL everywhere else in this repo. */
  N8N_INSTANCE_URL: string;
  /** Must match wrangler.toml's own `name = "..."` - see cfWorkerSecrets.ts. A plain var, not a
   * secret (it's not sensitive, just has to stay in sync with wrangler.toml if that ever changes). */
  CF_WORKER_SCRIPT_NAME: string;
  /** The following four are all OPTIONAL and all populated the same way: bound directly onto this
   * Worker by cfWorkerSecrets.ts, the moment their vendor's `key: selfBind: true` field is saved
   * through the wizard (see vendors.ts's `n8n`/`netlify-api` rows) - undefined until then, which is
   * exactly the "not connected yet" signal handlePushTargets below checks for before attempting a
   * push that depends on one. Not declared in wrangler.toml's [vars] - there's nothing to place a
   * placeholder in ahead of time the way TEAM_DOMAIN/POLICY_AUD/etc. are, since these only start
   * existing once bound at runtime. */
  N8N_API_KEY?: string;
  NETLIFY_ACCESS_TOKEN?: string;
  NETLIFY_ACCOUNT_SLUG?: string;
  NETLIFY_SITE_ID?: string;
}

const PLACEHOLDER_VALUES = new Set([
  'PLACEHOLDER_CLOUDFLARE_ACCESS_TEAM_DOMAIN',
  'PLACEHOLDER_CLOUDFLARE_ACCESS_APPLICATION_AUD',
  'PLACEHOLDER_CLOUDFLARE_ACCOUNT_ID',
  'PLACEHOLDER_CLOUDFLARE_SECRETS_STORE_ID',
]);

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedTeamDomain: string | undefined;

function getJwks(teamDomain: string) {
  if (cachedJwks && cachedTeamDomain === teamDomain) return cachedJwks;
  cachedJwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  cachedTeamDomain = teamDomain;
  return cachedJwks;
}

type AccessResult = { ok: true; email: string } | { ok: false; response: Response };

async function verifyAccess(request: Request, env: Env): Promise<AccessResult> {
  if (
    !env.TEAM_DOMAIN ||
    !env.POLICY_AUD ||
    PLACEHOLDER_VALUES.has(env.TEAM_DOMAIN) ||
    PLACEHOLDER_VALUES.has(env.POLICY_AUD)
  ) {
    return {
      ok: false,
      response: new Response(
        'Command Center is not configured yet (TEAM_DOMAIN/POLICY_AUD still placeholders). ' +
          'See DEPLOY.md — this Worker must never serve requests before the Access application exists.',
        { status: 500 },
      ),
    };
  }

  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) {
    return {
      ok: false,
      response: new Response(
        'Forbidden. This Worker must be reached through Cloudflare Access — ' +
          'if you are seeing this directly, Access is not correctly attached to this Worker. See DEPLOY.md.',
        { status: 403 },
      ),
    };
  }

  try {
    const { payload } = await jwtVerify(assertion, getJwks(env.TEAM_DOMAIN), {
      issuer: `https://${env.TEAM_DOMAIN}`,
      audience: env.POLICY_AUD,
    });
    const email = typeof payload.email === 'string' ? payload.email : 'unknown';
    return { ok: true, email };
  } catch {
    return { ok: false, response: new Response('Forbidden: invalid or expired Access token.', { status: 403 }) };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Checked BEFORE Access verification — this is a machine-to-machine route (n8n's
    // alert-dispatcher workflow), which can't complete an interactive Access login. Every other
    // route below is a human-facing browser session and stays behind Access.
    if (request.method === 'POST' && url.pathname === '/api/alerts') {
      return handleAlertsIngestAuthed(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/notifications') {
      return withMachineAuth(request, env, () => handleNotificationsIngest(request, env.MESSAGING_DB));
    }
    if (request.method === 'POST' && url.pathname === '/api/ai-action-requests') {
      return withMachineAuth(request, env, () => handleAiActionRequestsIngest(request, env.MESSAGING_DB));
    }
    if (request.method === 'POST' && url.pathname === '/api/demo-extensions/allocate') {
      return withMachineAuth(request, env, () => handleAllocateDemoExtension(env.MESSAGING_DB));
    }

    const access = await verifyAccess(request, env);
    if (!access.ok) return access.response;

    if (request.method === 'POST' && url.pathname === '/secrets') {
      return handleSecretsSubmit(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/status') {
      return handleStatusSubmit(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/messaging') {
      return handleMessagingPage(request, env.MESSAGING_DB, access.email);
    }
    if (request.method === 'POST' && url.pathname === '/messaging/alerts/acknowledge') {
      return handleAcknowledgeAlert(request, env.MESSAGING_DB, access.email);
    }
    if (request.method === 'POST' && url.pathname === '/messaging/tag-for-action') {
      return handlePostTagForAction(request, env.N8N_INSTANCE_URL, access.email);
    }
    if (request.method === 'POST' && url.pathname === '/messaging/notifications/read') {
      return handleMarkNotificationRead(request, env.MESSAGING_DB, access.email);
    }
    if (request.method === 'POST' && url.pathname === '/messaging/ai-actions/resolve') {
      return handleResolveAiAction(request, env.MESSAGING_DB, access.email);
    }
    if (request.method === 'POST' && url.pathname === '/messaging/channels') {
      return handleCreateChannel(request, env.MESSAGING_DB);
    }
    if (request.method === 'POST' && url.pathname === '/messaging/messages') {
      return handlePostMessage(request, env.MESSAGING_DB, access.email);
    }
    if (request.method === 'GET' && url.pathname === '/messaging/thread') {
      return handleThreadPage(request, env.MESSAGING_DB);
    }
    if (request.method === 'POST' && url.pathname === '/messaging/threads/comments') {
      return handlePostComment(request, env.MESSAGING_DB, access.email);
    }
    if (request.method === 'GET' && url.pathname === '/dialer') {
      return handleDialerPage(request);
    }
    if (request.method === 'POST' && url.pathname === '/dialer/next') {
      return handleGetNextCall(request, { n8nInstanceUrl: env.N8N_INSTANCE_URL }, access.email);
    }
    if (request.method === 'POST' && url.pathname === '/dialer/place-call') {
      return handlePlaceCall(request, { n8nInstanceUrl: env.N8N_INSTANCE_URL });
    }
    if (request.method === 'POST' && url.pathname === '/dialer/wrap-up') {
      return handleWrapUpCall(request, { n8nInstanceUrl: env.N8N_INSTANCE_URL });
    }
    if (request.method === 'GET' && url.pathname === '/deals-desk') {
      return handleDealsDeskPage(request, { n8nInstanceUrl: env.N8N_INSTANCE_URL });
    }
    if (request.method === 'POST' && url.pathname === '/deals-desk/amend') {
      return handleAmendContract(request, { n8nInstanceUrl: env.N8N_INSTANCE_URL });
    }
    if (request.method === 'GET' && url.pathname === '/') {
      const statuses = await getAllStatuses(env.STATUS, VENDORS.map((v) => v.id));
      return new Response(renderPage(access.email, url.searchParams, statuses), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

export async function handleAlertsIngestAuthed(request: Request, env: Env): Promise<Response> {
  return withMachineAuth(request, env, () => handleAlertsIngest(request, env.MESSAGING_DB));
}

/** Shared bearer-token check for every machine-to-machine ingest route n8n calls (alerts,
 * notifications, ai-action-requests) - factored out this pass rather than copy-pasted a third time,
 * since Tag-for-Action added two more routes needing the exact same check handleAlertsIngestAuthed
 * already did inline. */
async function withMachineAuth(request: Request, env: Env, handler: () => Promise<Response>): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${env.ALERTS_INGEST_SECRET}`;
  if (!env.ALERTS_INGEST_SECRET || env.ALERTS_INGEST_SECRET === 'PLACEHOLDER_ALERTS_INGEST_SECRET' || authHeader !== expected) {
    return new Response(JSON.stringify({ ok: false, reason: 'Unauthorized.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return handler();
}

function redirectWith(request: Request, params: Record<string, string>): Response {
  const redirectUrl = new URL('/', request.url);
  for (const [k, v] of Object.entries(params)) redirectUrl.searchParams.set(k, v);
  return Response.redirect(redirectUrl.toString(), 303);
}

async function handleStatusSubmit(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const vendorId = String(form.get('vendorId') ?? '');
  const vendor = VENDORS.find((v) => v.id === vendorId && v.authMode === 'cli');
  if (!vendor) return redirectWith(request, { error: `Unknown CLI vendor: ${vendorId}` });

  await markConnected(env.STATUS, vendor.id, 'cli');
  return redirectWith(request, { saved: vendor.id });
}

/** The "push it to the component that needs it" half of the wizard - runs AFTER a field's value is
 * already durably written to Secrets Store (the write this function is given never depends on
 * anything here succeeding). Two independent things can happen per field, both best-effort and
 * both reported back as a short status line rather than silently succeeding or failing:
 *   1. selfBind - binds the value directly onto THIS Worker (cfWorkerSecrets.ts) so it becomes
 *      readable as env.<secretName> on Command Center's own next request. Only set on the handful
 *      of fields Command Center's own push logic needs to read back (n8n's API key, Netlify's
 *      access token/site identifiers - see vendors.ts).
 *   2. pushTargets - delivers the value to n8n (as a named Credential) and/or Netlify (as a site
 *      env var), using whichever of the four env.N8N_API_KEY/NETLIFY_* fields are already bound.
 *      A dependency that isn't bound YET (e.g. saving a Claude key before n8n's own key has ever
 *      been saved) is reported as "not connected yet", not as a failure - saving the SAME field
 *      again once n8n is connected will retry it, but nothing here loops or defers automatically.
 * Exported for testing - this is the one piece of the wizard genuinely worth unit-testing in
 * isolation, since it's the actual new behavior this pass adds. */
export async function pushFieldValue(
  env: Env,
  field: CredentialField,
  value: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const notes: string[] = [];

  if (field.selfBind) {
    const bound = await bindWorkerSecret(env, { name: field.secretName, value }, fetchImpl);
    notes.push(bound.ok ? `bound to this Worker for future pushes` : `could not bind to this Worker: ${bound.errorMessage}`);
  }

  if (field.pushTargets?.n8nCredential) {
    const { name, type, buildData } = field.pushTargets.n8nCredential;
    if (!env.N8N_API_KEY || !env.N8N_INSTANCE_URL || env.N8N_INSTANCE_URL === 'PLACEHOLDER_N8N_INSTANCE_URL') {
      notes.push(`n8n not connected yet — "${name}" credential not pushed (save the n8n API key above first, then save this field again)`);
    } else {
      const result = await upsertN8nCredential(
        { n8nInstanceUrl: env.N8N_INSTANCE_URL, n8nApiKey: env.N8N_API_KEY, fetchImpl },
        { name, type, data: buildData(value) },
      );
      notes.push(result.ok ? `pushed to n8n as "${name}" (${result.updated ? 'updated' : 'created'})` : `n8n push failed: ${result.reason}`);
    }
  }

  if (field.pushTargets?.netlifyEnvVar) {
    const key = field.pushTargets.netlifyEnvVar;
    if (!env.NETLIFY_ACCESS_TOKEN || !env.NETLIFY_ACCOUNT_SLUG || !env.NETLIFY_SITE_ID) {
      notes.push(`Netlify not connected yet — ${key} not pushed (save the Netlify API access token above first, then save this field again)`);
    } else {
      const result = await setNetlifyEnvVar(
        { accessToken: env.NETLIFY_ACCESS_TOKEN, accountSlug: env.NETLIFY_ACCOUNT_SLUG, siteId: env.NETLIFY_SITE_ID, fetchImpl },
        { key, value },
      );
      notes.push(result.ok ? `pushed to Netlify as ${key}` : `Netlify push failed: ${result.reason}`);
    }
  }

  return notes;
}

async function handleSecretsSubmit(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const vendorId = String(form.get('vendorId') ?? '');
  const vendor = VENDORS.find((v) => v.id === vendorId && v.authMode === 'manual');
  if (!vendor || !vendor.fields) return redirectWith(request, { error: `Unknown manual vendor: ${vendorId}` });

  const pushNotes: string[] = [];
  for (const field of vendor.fields) {
    const value = String(form.get(`field__${field.key}`) ?? '').trim();
    if (!value) return redirectWith(request, { error: `${vendor.label}: ${field.label} was empty` });

    const result = await createSecret(env, { name: field.secretName, value });
    if (!result.ok) {
      return redirectWith(request, { error: `${vendor.label} (${field.label}): ${result.errorMessage ?? 'write failed'}` });
    }

    // Best-effort, deliberately never fails the whole submission - the Secrets Store write above
    // is already durable and complete; a push failing just means a manual copy is still needed
    // for that one destination, same as before this pass existed at all.
    for (const note of await pushFieldValue(env, field, value)) {
      pushNotes.push(`${field.label}: ${note}`);
    }
  }

  await markConnected(env.STATUS, vendor.id, 'manual');
  return redirectWith(request, pushNotes.length ? { saved: vendor.id, pushInfo: pushNotes.join(' · ') } : { saved: vendor.id });
}

function renderVendorRow(vendor: VendorDef, status: VendorStatus | undefined): string {
  const connected = status?.status === 'connected';
  const statusBadge = connected
    ? `<span class="status ok">✓ connected${status?.updatedAt ? ` · ${escapeHtml(status.updatedAt.slice(0, 10))}` : ''}</span>`
    : `<span class="status pending">not started</span>`;
  const uncertainBadge = vendor.uncertain
    ? `<span class="uncertain" title="CLI-auth support/shape assumed, not independently confirmed — check before relying on it">⚠ unconfirmed</span>`
    : '';

  if (vendor.authMode === 'cli') {
    return `
    <div class="row">
      <div class="row-label">
        <strong>${escapeHtml(vendor.label)} ${uncertainBadge}</strong>
        <span class="hint">${escapeHtml(vendor.hint)}</span>
        <code class="cmd">${escapeHtml(vendor.cliCommand ?? '')}</code>
      </div>
      <div class="row-action">
        ${statusBadge}
        <form method="post" action="/status">
          <input type="hidden" name="vendorId" value="${escapeHtml(vendor.id)}">
          <button type="submit" ${connected ? 'class="secondary"' : ''}>${connected ? 'Re-confirm' : 'Mark connected'}</button>
        </form>
      </div>
    </div>`;
  }

  const inputs = (vendor.fields ?? [])
    .map(
      (f) =>
        `<input type="password" name="field__${escapeHtml(f.key)}" placeholder="${escapeHtml(f.label)}" required>`,
    )
    .join('');

  return `
  <div class="row">
    <form class="row-inner" method="post" action="/secrets">
      <input type="hidden" name="vendorId" value="${escapeHtml(vendor.id)}">
      <div class="row-label">
        <strong>${escapeHtml(vendor.label)} ${uncertainBadge}</strong>
        <span class="hint">${escapeHtml(vendor.hint)}</span>
      </div>
      <div class="row-fields">${inputs}</div>
      ${statusBadge}
      <button type="submit">Save</button>
    </form>
  </div>`;
}

function renderPage(email: string, params: URLSearchParams, statuses: Map<string, VendorStatus>): string {
  const saved = params.get('saved');
  const error = params.get('error');
  const pushInfo = params.get('pushInfo');

  let banner = '';
  if (saved) {
    const vendor = VENDORS.find((v) => v.id === saved);
    banner = `<div class="banner ok">${escapeHtml(vendor?.label ?? saved)} marked connected.</div>`;
    if (pushInfo) {
      // One line per field, "·"-joined by handleSecretsSubmit - re-split for a readable list rather
      // than one long run-on sentence. A field whose only note is the plain Secrets Store write
      // (no selfBind/pushTargets configured) never appears here at all - pushNotes only ever
      // collects something when there was a push attempt to report on.
      const lines = pushInfo.split(' · ').map((line) => `<div>${escapeHtml(line)}</div>`).join('');
      banner += `<div class="banner ${pushInfo.includes('failed') || pushInfo.includes('not connected') ? 'warn' : 'ok'}" style="margin-top:-8px">${lines}</div>`;
    }
  } else if (error) {
    banner = `<div class="banner err">${escapeHtml(error)}</div>`;
  }

  const cliVendors = VENDORS.filter((v) => v.authMode === 'cli');
  const manualVendors = VENDORS.filter((v) => v.authMode === 'manual');
  const connectedCount = VENDORS.filter((v) => statuses.get(v.id)?.status === 'connected').length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orbit Command Center</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a1628; color: #eaf3fb;
         display: flex; align-items: flex-start; justify-content: center; min-height: 100vh;
         margin: 0; padding: 48px 20px; }
  .card { max-width: 720px; width: 100%; padding: 32px 36px; border: 1px solid #1c2c42;
          border-radius: 16px; background: #0c1726; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: #7fe0ff;
       margin: 28px 0 4px; }
  .sub { color: #90b3cf; font-size: 13px; margin: 0 0 20px; }
  .badge { display: inline-block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
           color: #7fe0ff; border: 1px solid rgba(127,224,255,.35); border-radius: 999px;
           padding: 3px 10px; margin-bottom: 14px; }
  .progress { color: #52688a; font-size: 12px; }
  .banner { border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 18px; }
  .banner.ok { background: rgba(45,212,191,.12); border: 1px solid rgba(45,212,191,.35); color: #7fe8db; }
  .banner.err { background: rgba(251,113,133,.12); border: 1px solid rgba(251,113,133,.35); color: #fda4af; }
  .banner.warn { background: rgba(246,166,9,.12); border: 1px solid rgba(246,166,9,.35); color: #f6a609; }
  .row { border-top: 1px solid #1c2c42; padding: 14px 0; }
  h2:first-of-type + .row, h2 + .row:first-of-type { border-top: none; }
  .row-inner { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .row-label { flex: 1; min-width: 220px; display: flex; flex-direction: column; }
  .row-fields { display: flex; gap: 8px; flex-wrap: wrap; }
  .row-action { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; }
  .hint { color: #52688a; font-size: 12px; margin-top: 2px; }
  .cmd { display: inline-block; margin-top: 6px; background: #0a1422; padding: 3px 8px;
         border-radius: 6px; color: #7fe0ff; font-size: 12px; width: fit-content; }
  .status { font-size: 11px; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
  .status.ok { background: rgba(45,212,191,.12); color: #7fe8db; }
  .status.pending { background: rgba(82,104,138,.2); color: #90b3cf; }
  .uncertain { font-size: 11px; color: #f6a609; font-weight: 400; text-transform: none;
               letter-spacing: 0; }
  input[type="password"] { width: 160px; background: #0a1422; border: 1px solid #1c2c42;
         border-radius: 8px; padding: 8px 10px; color: #eaf3fb; font-size: 13px; }
  button { background: linear-gradient(160deg,#1fb6ff,#0a8fd6); color: #04121f; font-weight: 700;
         border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
  button.secondary { background: #0a1422; color: #90b3cf; border: 1px solid #1c2c42; }
</style>
</head>
<body>
  <div class="card">
    <span class="badge">Checkpoint 3 · Full vendor checklist</span>
    <h1>Orbit Command Center</h1>
    <p class="sub">Signed in as ${escapeHtml(email)}. <span class="progress">${connectedCount}/${VENDORS.length} connected.</span>
      &middot; <a href="/messaging" style="color:#7fe0ff">Team messaging (Piece 2)</a>
      &middot; <a href="/dialer" style="color:#7fe0ff">Dialer</a>
      &middot; <a href="/deals-desk" style="color:#7fe0ff">Deals Desk</a></p>
    ${banner}

    <h2>CLI-auth — run locally, then confirm here</h2>
    ${cliVendors.map((v) => renderVendorRow(v, statuses.get(v.id))).join('')}

    <h2>Manual paste — no CLI-auth path found</h2>
    ${manualVendors.map((v) => renderVendorRow(v, statuses.get(v.id))).join('')}
  </div>
</body>
</html>`;
}
