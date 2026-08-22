/**
 * Cloudflare Secrets Store write client.
 *
 * ⚠️ UNVERIFIED AGAINST THE LIVE API — read before touching this file.
 *
 * The request shape below (`POST /accounts/{account_id}/secrets_store/stores/{store_id}/secrets`,
 * body `[{ name, value, scopes, comment }]`) is inferred from three things that ARE confirmed:
 *   1. Cloudflare's account-scoped REST convention: every resource lives at
 *      `/client/v4/accounts/{account_id}/<resource>`.
 *   2. The `wrangler secrets-store secret create [STORE-ID] --name --value --scopes --comment`
 *      command, which is fully documented and must be calling *some* REST endpoint with
 *      exactly these fields.
 *   3. The bulk-secrets pattern Cloudflare uses elsewhere in Workers (array-of-objects body).
 *
 * What's NOT confirmed: I could not fetch the literal OpenAPI reference page for this endpoint
 * (developers.cloudflare.com is blocked for direct fetch in this environment, and repeated
 * targeted searches through the available Cloudflare-docs search tool only ever surfaced the
 * wrangler CLI reference, never the raw request/response schema). So the URL path, whether the
 * body is a single object vs. an array, and the exact response shape are a confident inference,
 * not a verified fact.
 *
 * Before relying on this in anything beyond the checkpoint-2 test: run it once against the two
 * test credentials, and if it 400s, the fix is almost certainly here — either flip the body
 * between a single object and a one-element array, or compare against what
 * `wrangler secrets-store secret create <store-id> --name x --value y --scopes workers --remote`
 * actually sends (e.g. via `WRANGLER_LOG=debug`) and match it exactly.
 */

export interface SecretsStoreEnv {
  CF_ACCOUNT_ID: string;
  CF_SECRETS_STORE_ID: string;
  CF_API_TOKEN: string;
}

export interface CreateSecretResult {
  ok: boolean;
  secretId?: string;
  errorMessage?: string;
  /** Raw response body, always included so a schema mismatch is visible immediately rather
   * than swallowed behind a generic "it failed" message. */
  raw: unknown;
}

export async function createSecret(
  env: SecretsStoreEnv,
  params: { name: string; value: string; comment?: string },
): Promise<CreateSecretResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/secrets_store/stores/${env.CF_SECRETS_STORE_ID}/secrets`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      {
        name: params.name,
        value: params.value,
        scopes: ['workers'],
        comment: params.comment ?? 'Written by the Orbit Command Center wizard',
      },
    ]),
  });

  const raw: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const errorMessage =
      raw && typeof raw === 'object' && 'errors' in raw
        ? JSON.stringify((raw as { errors: unknown }).errors)
        : `HTTP ${response.status}`;
    return { ok: false, errorMessage, raw };
  }

  // Cloudflare's account-scoped APIs wrap results as { success, result }; bulk-style ones
  // often return an array under result. Handle both shapes rather than assuming one.
  const result =
    raw && typeof raw === 'object' && 'result' in raw
      ? (raw as { result: unknown }).result
      : undefined;
  const first = Array.isArray(result) ? result[0] : result;
  const secretId =
    first && typeof first === 'object' && 'id' in first ? String((first as { id: unknown }).id) : undefined;

  return { ok: true, secretId, raw };
}
