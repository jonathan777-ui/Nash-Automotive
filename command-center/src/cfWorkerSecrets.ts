/**
 * Cloudflare Workers Script Secrets client — lets this Worker bind a value directly onto its OWN
 * running script, so `env.NAME` becomes readable by this Worker's own code on the next request.
 *
 * ⚠️ UNVERIFIED AGAINST THE LIVE API — same caveat as `secretsStore.ts`, read before touching this
 * file. The request shape (`PUT /accounts/{account_id}/workers/scripts/{script_name}/secrets`, body
 * `{name, text, type: "secret_text"}`) is Cloudflare's documented Workers Script API for exactly
 * this — it's the same endpoint `wrangler secret put` itself calls under the hood — but it hasn't
 * been exercised against a real account from this sandbox.
 *
 * WHY THIS EXISTS, distinct from `secretsStore.ts`: Secrets Store is a general-purpose holding pen
 * — every credential this project collects gets written there as the system of record, but its
 * management API is write-only (no way to read a value back once written, by design). A handful of
 * credentials need to be usable by Command Center's OWN outbound calls (n8n's API key, to push
 * OTHER credentials into n8n as it collects them; a Netlify access token, same idea for Netlify env
 * vars) — those need a REAL binding this Worker can read from, which is exactly what
 * `CF_API_TOKEN` and `ALERTS_INGEST_SECRET` already are via `wrangler secret put` (see
 * `wrangler.toml`'s own comments on both). This module lets the WIZARD ITSELF perform that binding
 * at submit time, instead of asking for a second manual `wrangler secret put` step for every
 * "pusher" credential.
 *
 * A secret bound this way is expected to become readable via `env.NAME` on Command Center's very
 * NEXT request after this call returns — NOT within the same request/response cycle that created
 * it (`env` is a snapshot taken at invocation start). Every caller of this module accounts for that:
 * see `index.ts`'s push-orchestration logic, which checks whether the relevant `env.*` field is
 * already populated before attempting a dependent push, and says so plainly rather than erroring
 * when it isn't yet.
 */

export interface WorkerSecretsEnv {
  CF_ACCOUNT_ID: string;
  /** Same token Secrets Store writes use — needs "Workers Scripts:Edit" permission in ADDITION to
   * whatever Secrets Store scope it already has, for this specific call to succeed. Documented in
   * DEPLOY.md; not a separate credential from CF_API_TOKEN. */
  CF_API_TOKEN: string;
  /** Must match wrangler.toml's own `name = "..."` — the script this binds the secret onto. */
  CF_WORKER_SCRIPT_NAME: string;
}

export interface BindWorkerSecretResult {
  ok: boolean;
  errorMessage?: string;
  raw: unknown;
}

export async function bindWorkerSecret(
  env: WorkerSecretsEnv,
  params: { name: string; value: string },
  fetchImpl: typeof fetch = fetch,
): Promise<BindWorkerSecretResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${env.CF_WORKER_SCRIPT_NAME}/secrets`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: params.name, text: params.value, type: 'secret_text' }),
    });
  } catch (err) {
    return { ok: false, errorMessage: `Could not reach the Cloudflare API: ${(err as Error).message}`, raw: undefined };
  }

  const raw: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const errorMessage =
      raw && typeof raw === 'object' && 'errors' in raw
        ? JSON.stringify((raw as { errors: unknown }).errors)
        : `HTTP ${response.status}`;
    return { ok: false, errorMessage, raw };
  }
  return { ok: true, raw };
}
