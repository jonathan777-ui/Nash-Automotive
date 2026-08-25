import { createHash, timingSafeEqual } from 'node:crypto';

/** W1.7: "Documents/Files access (PIN-gated via Netlify Function, with an audit log of access)."
 * The PIN itself is generated and hashed by `onboarding-provisioning.workflow.json` (Phase 6/W6.3)
 * onto the Company record (`documentsAccessPinHash`) right after Stripe payment succeeds — this
 * function only ever sees and compares hashes, never re-derives or stores a plaintext PIN itself. */

export interface VerifyDocumentsPinInput {
  opportunityId: string;
  pin: string;
}

export interface VerifyDocumentsPinSuccess {
  ok: true;
  driveFolderUrl: string;
}
export interface VerifyDocumentsPinFailure {
  ok: false;
  status: number;
  reason: string;
}
export type VerifyDocumentsPinResult = VerifyDocumentsPinSuccess | VerifyDocumentsPinFailure;

export interface VerifyDocumentsPinDeps {
  twentyCrmBaseUrl: string;
  twentyCrmApiKey: string;
  fetchImpl?: typeof fetch;
  /** Injectable for tests - defaults to Date.now-based, not used for anything security-critical
   * (only the audit log timestamp), so a fake clock is enough. */
  now?: () => string;
}

function unwrap(body: unknown, ...wrapperKeys: string[]): unknown {
  let current: any = body;
  for (const key of wrapperKeys) {
    if (current && typeof current === 'object' && key in current) current = current[key];
  }
  return current;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time comparison of the two hex digests - PINs are only 6 digits (low entropy), so
 * timing safety on the comparison itself matters more than it would for a real high-entropy secret;
 * cheap to do right, no reason not to. */
function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Best-effort, fire-and-forget - an audit-log write failing should never block telling the client
 * whether their PIN was right, same "never let a non-critical write become the critical path"
 * discipline as every other fire-and-forget call in this repo. Writes directly to Twenty CRM's
 * Activity Event timeline (same endpoint dnc-check.workflow.json's override log uses) rather than
 * routing through n8n - this function already calls Twenty CRM directly for the PIN check itself
 * (same as getOpportunity.ts), so a second hop through n8n for the audit write would be a needless
 * extra failure point for a log line. */
async function logAccessAttempt(
  opportunityId: string,
  granted: boolean,
  deps: VerifyDocumentsPinDeps,
): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const at = deps.now ? deps.now() : new Date().toISOString();
  try {
    await fetchImpl(`${deps.twentyCrmBaseUrl}/rest/activityEvents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.twentyCrmApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityId, type: 'DocumentsAccessAttempt', granted, at }),
    });
  } catch {
    // best-effort - see this function's own comment above
  }
}

export async function verifyDocumentsPin(
  input: VerifyDocumentsPinInput,
  deps: VerifyDocumentsPinDeps,
): Promise<VerifyDocumentsPinResult> {
  const opportunityId = input.opportunityId?.trim() ?? '';
  const pin = input.pin?.trim() ?? '';
  if (!opportunityId || !pin) {
    return { ok: false, status: 400, reason: 'Missing opportunityId or pin.' };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${deps.twentyCrmApiKey}` };

  let oppRes: Response;
  try {
    oppRes = await fetchImpl(`${deps.twentyCrmBaseUrl}/rest/opportunities/${encodeURIComponent(opportunityId)}`, { headers });
  } catch (err) {
    return { ok: false, status: 502, reason: `Could not reach Twenty CRM: ${(err as Error).message}` };
  }
  if (!oppRes.ok) {
    return { ok: false, status: oppRes.status === 404 ? 404 : 502, reason: `Twenty CRM returned ${oppRes.status} for the Opportunity.` };
  }
  const oppRaw = await oppRes.json();
  const oppBody = (unwrap(oppRaw, 'data', 'opportunity') ?? unwrap(oppRaw, 'data') ?? oppRaw) as any;
  const companyId = oppBody?.companyId;
  if (!companyId) {
    return { ok: false, status: 409, reason: 'Documents access has not been provisioned yet - try again in a moment.' };
  }

  let companyRes: Response;
  try {
    companyRes = await fetchImpl(`${deps.twentyCrmBaseUrl}/rest/companies/${encodeURIComponent(companyId)}`, { headers });
  } catch (err) {
    return { ok: false, status: 502, reason: `Could not reach Twenty CRM: ${(err as Error).message}` };
  }
  if (!companyRes.ok) {
    return { ok: false, status: 502, reason: `Twenty CRM returned ${companyRes.status} for the Company.` };
  }
  const companyRaw = await companyRes.json();
  const companyBody = (unwrap(companyRaw, 'data', 'company') ?? unwrap(companyRaw, 'data') ?? companyRaw) as any;
  const storedHash: string | undefined = companyBody?.documentsAccessPinHash;
  const driveFolderUrl: string | undefined = companyBody?.driveFolderUrl;

  if (!storedHash || !driveFolderUrl) {
    return { ok: false, status: 409, reason: 'Documents access has not been provisioned yet - try again in a moment.' };
  }

  const granted = hashesMatch(sha256(pin), storedHash);
  await logAccessAttempt(opportunityId, granted, deps);

  if (!granted) {
    return { ok: false, status: 403, reason: 'Incorrect PIN.' };
  }
  return { ok: true, driveFolderUrl };
}
