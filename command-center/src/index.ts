import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createSecret, type SecretsStoreEnv } from './secretsStore.js';
import { TEST_VENDORS } from './vendors.js';
import { escapeHtml } from './util.js';

export interface Env extends SecretsStoreEnv {
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
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
      return handleSubmit(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(renderPage(access.email, url.searchParams), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const vendorId = String(form.get('vendorId') ?? '');
  const value = String(form.get('value') ?? '');

  const vendor = TEST_VENDORS.find((v) => v.id === vendorId);
  if (!vendor) {
    return Response.redirect(new URL(`/?error=${encodeURIComponent('Unknown vendor: ' + vendorId)}`, request.url).toString(), 303);
  }
  if (!value.trim()) {
    return Response.redirect(new URL(`/?error=${encodeURIComponent(vendor.label + ': value was empty')}`, request.url).toString(), 303);
  }

  const result = await createSecret(env, { name: vendor.secretName, value: value.trim() });

  const redirectUrl = new URL('/', request.url);
  if (result.ok) {
    redirectUrl.searchParams.set('saved', vendor.id);
    if (result.secretId) redirectUrl.searchParams.set('secretId', result.secretId);
  } else {
    redirectUrl.searchParams.set('error', `${vendor.label}: ${result.errorMessage ?? 'write failed'}`);
  }
  return Response.redirect(redirectUrl.toString(), 303);
}

function renderPage(email: string, params: URLSearchParams): string {
  const saved = params.get('saved');
  const secretId = params.get('secretId');
  const error = params.get('error');

  let banner = '';
  if (saved) {
    const vendor = TEST_VENDORS.find((v) => v.id === saved);
    banner = `<div class="banner ok">Saved ${escapeHtml(vendor?.label ?? saved)} to Secrets Store${
      secretId ? ` (secret id <code>${escapeHtml(secretId)}</code>)` : ''
    }.</div>`;
  } else if (error) {
    banner = `<div class="banner err">${escapeHtml(error)}</div>`;
  }

  const rows = TEST_VENDORS.map(
    (v) => `
    <form class="row" method="post" action="/secrets">
      <input type="hidden" name="vendorId" value="${escapeHtml(v.id)}">
      <div class="row-label">
        <strong>${escapeHtml(v.label)}</strong>
        <span class="hint">${escapeHtml(v.hint)}</span>
      </div>
      <input type="password" name="value" placeholder="paste API key" required>
      <button type="submit">Save</button>
    </form>`,
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orbit Command Center</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a1628; color: #eaf3fb;
         display: flex; align-items: flex-start; justify-content: center; min-height: 100vh;
         margin: 0; padding: 48px 20px; }
  .card { max-width: 560px; width: 100%; padding: 32px 36px; border: 1px solid #1c2c42;
          border-radius: 16px; background: #0c1726; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #90b3cf; font-size: 13px; margin: 0 0 20px; }
  .badge { display: inline-block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
           color: #7fe0ff; border: 1px solid rgba(127,224,255,.35); border-radius: 999px;
           padding: 3px 10px; margin-bottom: 14px; }
  .banner { border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 18px; }
  .banner.ok { background: rgba(45,212,191,.12); border: 1px solid rgba(45,212,191,.35); color: #7fe8db; }
  .banner.err { background: rgba(251,113,133,.12); border: 1px solid rgba(251,113,133,.35); color: #fda4af; }
  .row { display: flex; align-items: flex-end; gap: 10px; padding: 14px 0; border-top: 1px solid #1c2c42; }
  .row:first-of-type { border-top: none; }
  .row-label { flex: 1; display: flex; flex-direction: column; }
  .hint { color: #52688a; font-size: 12px; margin-top: 2px; }
  input[type="password"] { flex: 1; max-width: 220px; background: #0a1422; border: 1px solid #1c2c42;
         border-radius: 8px; padding: 8px 10px; color: #eaf3fb; font-size: 13px; }
  button { background: linear-gradient(160deg,#1fb6ff,#0a8fd6); color: #04121f; font-weight: 700;
         border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; cursor: pointer; }
  code { background: #0a1422; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
  <div class="card">
    <span class="badge">Checkpoint 2 · Test credential writes</span>
    <h1>Orbit Command Center</h1>
    <p class="sub">Signed in as ${escapeHtml(email)}. Manual-paste fallback path only — CLI-auth
    vendors don't go through this form (see README).</p>
    ${banner}
    ${rows}
  </div>
</body>
</html>`;
}
