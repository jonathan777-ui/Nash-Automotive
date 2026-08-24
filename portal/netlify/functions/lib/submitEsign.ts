export interface EsignInput {
  opportunityId: string;
  typedName: string;
  checked: boolean;
}

export interface SubmitEsignSuccess {
  ok: true;
}
export interface SubmitEsignFailure {
  ok: false;
  status: number;
  reason: string;
}
export type SubmitEsignResult = SubmitEsignSuccess | SubmitEsignFailure;

export interface SubmitEsignDeps {
  n8nEsignWebhookUrl: string;
  fetchImpl?: typeof fetch;
  /** Injectable so tests don't depend on wall-clock time. */
  now?: () => Date;
}

/** Server-side validation mirrors workflows/phase-1-mvp/portal-esign-submitted.workflow.json's own
 * IF-node check - belt and suspenders, since a client-side-only check can be bypassed by anyone
 * calling this endpoint directly. The timestamp and IP are captured HERE (server-side), not trusted
 * from the browser - a client could lie about either if this function just forwarded what the page
 * sent. */
export async function submitEsign(
  input: EsignInput,
  clientIp: string,
  deps: SubmitEsignDeps,
): Promise<SubmitEsignResult> {
  if (!input.opportunityId?.trim()) return { ok: false, status: 400, reason: 'Missing opportunity id.' };
  if (!input.typedName?.trim()) return { ok: false, status: 400, reason: 'Typed name is required.' };
  if (input.checked !== true) return { ok: false, status: 400, reason: 'The agreement checkbox must be checked.' };

  const now = deps.now ?? (() => new Date());
  const fetchImpl = deps.fetchImpl ?? fetch;

  const payload = {
    opportunityId: input.opportunityId,
    typedName: input.typedName.trim(),
    checked: true,
    timestampIso: now().toISOString(),
    ip: clientIp,
  };

  let response: Response;
  try {
    response = await fetchImpl(deps.n8nEsignWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, status: 502, reason: `Could not reach the signing workflow: ${(err as Error).message}` };
  }

  if (!response.ok) {
    return { ok: false, status: 502, reason: `Signing workflow returned ${response.status}.` };
  }

  return { ok: true };
}
