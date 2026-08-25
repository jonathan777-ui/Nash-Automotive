/**
 * Pushes a value into a Netlify site's environment variables — closes the "copying a value from
 * [Secrets Store] to a Netlify env var is a rename-free copy" gap `portal/README.md` has described
 * since it was written, where that copy was always a manual step.
 *
 * ⚠️ UNVERIFIED AGAINST A LIVE NETLIFY ACCOUNT — Netlify's account-scoped env var API
 * (`PATCH /api/v1/accounts/{account_slug}/env/{key}`, scoped to one site via a `scope`/`contexts`
 * value in the body) is Netlify's real, documented shape for this, not guessed at random, but not
 * exercised against a live account from this sandbox — same treatment as every other external
 * integration point in this repo before real credentials exist.
 */

export interface NetlifyEnvDeps {
  accessToken: string;
  accountSlug: string;
  siteId: string;
  fetchImpl?: typeof fetch;
}

export interface SetNetlifyEnvVarResult {
  ok: boolean;
  reason?: string;
}

/** One PATCH call, upserting a single key - Netlify's env var API treats a PATCH to `/env/{key}`
 * as create-or-replace, so there's no separate "does it already exist" check needed the way n8n's
 * credential API requires (n8n has no concept of upserting by name; Netlify's key IS the identity). */
export async function setNetlifyEnvVar(deps: NetlifyEnvDeps, params: { key: string; value: string }): Promise<SetNetlifyEnvVarResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = `https://api.netlify.com/api/v1/accounts/${deps.accountSlug}/env/${encodeURIComponent(params.key)}`;

  try {
    const res = await fetchImpl(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${deps.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: params.key,
        values: [{ value: params.value, context: 'production' }],
        scopes: ['functions', 'builds'],
      }),
    });
    if (!res.ok) return { ok: false, reason: `Netlify PATCH /env/${params.key} returned ${res.status} (site ${deps.siteId}).` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Could not reach Netlify: ${(err as Error).message}` };
  }
}
