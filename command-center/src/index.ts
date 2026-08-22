import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface Env {
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
}

const PLACEHOLDER_VALUES = new Set([
  'PLACEHOLDER_CLOUDFLARE_ACCESS_TEAM_DOMAIN',
  'PLACEHOLDER_CLOUDFLARE_ACCESS_APPLICATION_AUD',
]);

// Cache the JWKS fetcher across invocations of the same isolate; createRemoteJWKSet
// handles its own key-rotation caching internally.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedTeamDomain: string | undefined;

function getJwks(teamDomain: string) {
  if (cachedJwks && cachedTeamDomain === teamDomain) return cachedJwks;
  cachedJwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  cachedTeamDomain = teamDomain;
  return cachedJwks;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (
      !env.TEAM_DOMAIN ||
      !env.POLICY_AUD ||
      PLACEHOLDER_VALUES.has(env.TEAM_DOMAIN) ||
      PLACEHOLDER_VALUES.has(env.POLICY_AUD)
    ) {
      // Fails closed: an unconfigured deploy must refuse traffic, not serve it unauthenticated.
      return new Response(
        'Command Center is not configured yet (TEAM_DOMAIN/POLICY_AUD still placeholders). ' +
          'See DEPLOY.md — this Worker must never serve requests before the Access application exists.',
        { status: 500 },
      );
    }

    const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!assertion) {
      return new Response(
        'Forbidden. This Worker must be reached through Cloudflare Access — ' +
          'if you are seeing this directly, Access is not correctly attached to this Worker. See DEPLOY.md.',
        { status: 403 },
      );
    }

    let email: string | undefined;
    try {
      const { payload } = await jwtVerify(assertion, getJwks(env.TEAM_DOMAIN), {
        issuer: `https://${env.TEAM_DOMAIN}`,
        audience: env.POLICY_AUD,
      });
      email = typeof payload.email === 'string' ? payload.email : undefined;
    } catch {
      return new Response('Forbidden: invalid or expired Access token.', { status: 403 });
    }

    return new Response(renderCheckpointPage(email), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
};

function renderCheckpointPage(email: string | undefined): string {
  const escapedEmail = (email ?? 'unknown').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orbit Command Center</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a1628; color: #eaf3fb;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { max-width: 480px; padding: 32px 36px; border: 1px solid #1c2c42; border-radius: 16px;
          background: #0c1726; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .badge { display: inline-block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
           color: #7fe0ff; border: 1px solid rgba(127,224,255,.35); border-radius: 999px;
           padding: 3px 10px; margin-bottom: 14px; }
  p { color: #90b3cf; line-height: 1.5; font-size: 14px; }
  code { background: #0a1422; padding: 2px 6px; border-radius: 4px; color: #eaf3fb; }
</style>
</head>
<body>
  <div class="card">
    <span class="badge">Checkpoint 1 · Auth gate</span>
    <h1>You're in, ${escapedEmail}.</h1>
    <p>Cloudflare Access verified this request before it reached the Worker, and this Worker
    independently re-verified the Access JWT (issuer + audience) before rendering anything.</p>
    <p>The credential intake form and Secrets Store writes are checkpoint 2 — not built yet on
    purpose, so this auth gate could be verified and checked in on its own first.</p>
  </div>
</body>
</html>`;
}
