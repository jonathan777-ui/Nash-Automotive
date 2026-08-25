/**
 * Pushes a credential value into n8n as a real n8n Credential object — the same named credential
 * every workflow in `workflows/` already references (`credentials: { httpBearerAuth: { name:
 * "Twenty CRM API" } }` etc.). Closes the gap this whole project has documented since the first
 * credential-naming section was written: "Same names as the Command Center wizard writes to
 * Cloudflare Secrets Store... so wiring a real n8n instance up later is a rename-free copy" used to
 * mean a HUMAN did that copy by hand; this makes it automatic.
 *
 * ⚠️ UNVERIFIED AGAINST A LIVE N8N INSTANCE — n8n's public REST API (`/api/v1/credentials`,
 * `X-N8N-API-KEY` header) is real and documented, but the exact `data` shape per credential `type`
 * below is inferred from n8n's own credential-type conventions, not confirmed against a live n8n
 * install from this sandbox. If a push fails with a schema-shaped error, this mapping is almost
 * certainly the first thing to check.
 *
 * IMPORTANT SCOPE LIMIT, stated plainly rather than silently worked around: this can only push
 * values n8n workflows read via a named CREDENTIAL object (`genericAuthType`/`credentials:` node
 * parameters). Plenty of values this repo's workflows need are read directly as `$env.SOMETHING`
 * inside Code/expression nodes instead (`TWENTY_CRM_BASE_URL`, `STRIPE_WEBHOOK_SECRET`,
 * `TELNYX_CONNECTION_ID`/`TELNYX_SIP_DOMAIN`/etc.) — those are n8n's own runtime environment
 * variables, which live in whatever's running n8n (Docker Compose env, systemd unit, etc. on the
 * Oracle box) and have no REST API to set them remotely. Nothing in this module (or the wizard UI
 * that calls it) claims to push those; see each vendor's own `hint` text in `vendors.ts` for which
 * of its fields fall into this category.
 */

export type N8nCredentialType = 'httpBearerAuth' | 'httpHeaderAuth';

export interface N8nCredentialDeps {
  n8nInstanceUrl: string;
  n8nApiKey: string;
  fetchImpl?: typeof fetch;
}

export interface UpsertN8nCredentialInput {
  /** Must exactly match the credential name every workflow references it by (case-sensitive) —
   * see `workflows/README.md`'s credential-naming section for the authoritative list. */
  name: string;
  type: N8nCredentialType;
  /** httpBearerAuth: {token}. httpHeaderAuth: {name, value} (the header name/value pair the
   * credential injects into every request that uses it). */
  data: Record<string, string>;
}

export interface UpsertN8nCredentialResult {
  ok: boolean;
  reason?: string;
  /** True when an existing credential (matched by name) was updated rather than a new one
   * created — surfaced so the UI can say "updated" vs "created," not load-bearing otherwise. */
  updated?: boolean;
}

interface N8nCredentialListEntry {
  id: string;
  name: string;
}

async function listCredentials(deps: N8nCredentialDeps, fetchImpl: typeof fetch): Promise<N8nCredentialListEntry[]> {
  const res = await fetchImpl(`${deps.n8nInstanceUrl}/api/v1/credentials`, {
    headers: { 'X-N8N-API-KEY': deps.n8nApiKey },
  });
  if (!res.ok) throw new Error(`n8n GET /credentials returned ${res.status}`);
  const body: any = await res.json().catch(() => ({}));
  // Same "try the plausible shapes, don't commit to one guess" discipline as every Twenty CRM REST
  // call in workflows/ - n8n's list endpoints have wrapped their payload under `data` in some
  // versions, returned a bare array in others.
  const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
  return list.map((c: any) => ({ id: String(c.id), name: String(c.name) }));
}

/** Upserts by NAME, not id (the wizard has no durable n8n credential id to remember between visits
 * — a re-submitted vendor form should update the same credential, not pile up duplicates named
 * identically). Lists first, then PATCHes if a name match exists, else POSTs a new one. */
export async function upsertN8nCredential(deps: N8nCredentialDeps, input: UpsertN8nCredentialInput): Promise<UpsertN8nCredentialResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const headers = { 'X-N8N-API-KEY': deps.n8nApiKey, 'Content-Type': 'application/json' };

  let existing: N8nCredentialListEntry | undefined;
  try {
    const list = await listCredentials(deps, fetchImpl);
    existing = list.find((c) => c.name === input.name);
  } catch (err) {
    return { ok: false, reason: `Could not list existing n8n credentials: ${(err as Error).message}` };
  }

  const body = JSON.stringify({ name: input.name, type: input.type, data: input.data });

  try {
    if (existing) {
      const res = await fetchImpl(`${deps.n8nInstanceUrl}/api/v1/credentials/${existing.id}`, { method: 'PATCH', headers, body });
      if (!res.ok) return { ok: false, reason: `n8n PATCH /credentials/${existing.id} returned ${res.status}` };
      return { ok: true, updated: true };
    }
    const res = await fetchImpl(`${deps.n8nInstanceUrl}/api/v1/credentials`, { method: 'POST', headers, body });
    if (!res.ok) return { ok: false, reason: `n8n POST /credentials returned ${res.status}` };
    return { ok: true, updated: false };
  } catch (err) {
    return { ok: false, reason: `Could not reach n8n: ${(err as Error).message}` };
  }
}
