import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createSecret, type SecretsStoreEnv } from './secretsStore.js';
import { VENDORS, type VendorDef } from './vendors.js';
import { escapeHtml } from './util.js';
import { getAllStatuses, markConnected, type VendorStatus } from './status.js';

export interface Env extends SecretsStoreEnv {
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  STATUS: KVNamespace;
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
    const access = await verifyAccess(request, env);
    if (!access.ok) return access.response;

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/secrets') {
      return handleSecretsSubmit(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/status') {
      return handleStatusSubmit(request, env);
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

async function handleSecretsSubmit(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const vendorId = String(form.get('vendorId') ?? '');
  const vendor = VENDORS.find((v) => v.id === vendorId && v.authMode === 'manual');
  if (!vendor || !vendor.fields) return redirectWith(request, { error: `Unknown manual vendor: ${vendorId}` });

  for (const field of vendor.fields) {
    const value = String(form.get(`field__${field.key}`) ?? '').trim();
    if (!value) return redirectWith(request, { error: `${vendor.label}: ${field.label} was empty` });

    const result = await createSecret(env, { name: field.secretName, value });
    if (!result.ok) {
      return redirectWith(request, { error: `${vendor.label} (${field.label}): ${result.errorMessage ?? 'write failed'}` });
    }
  }

  await markConnected(env.STATUS, vendor.id, 'manual');
  return redirectWith(request, { saved: vendor.id });
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

  let banner = '';
  if (saved) {
    const vendor = VENDORS.find((v) => v.id === saved);
    banner = `<div class="banner ok">${escapeHtml(vendor?.label ?? saved)} marked connected.</div>`;
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
    <p class="sub">Signed in as ${escapeHtml(email)}. <span class="progress">${connectedCount}/${VENDORS.length} connected.</span></p>
    ${banner}

    <h2>CLI-auth — run locally, then confirm here</h2>
    ${cliVendors.map((v) => renderVendorRow(v, statuses.get(v.id))).join('')}

    <h2>Manual paste — no CLI-auth path found</h2>
    ${manualVendors.map((v) => renderVendorRow(v, statuses.get(v.id))).join('')}
  </div>
</body>
</html>`;
}
