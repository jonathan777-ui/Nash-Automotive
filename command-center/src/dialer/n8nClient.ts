/** Pure, unit-tested calls out to the real dialer-hopper workflows (`workflows/phase-3-dialer-hopper/`,
 * `workflows/phase-5-telnyx-activation/`) - Command Center never talks to Twenty CRM directly
 * anywhere in this repo (n8n is the sole integration point, same architecture
 * `handlePostTagForAction` already follows), and the dialer UI is no exception. Each function here
 * is a thin, testable wrapper around one webhook call; `routes.ts` wires these to HTTP framing and
 * the state-carrying `state=` query param the `/dialer` page round-trips between actions. */

export interface Rep {
  id: string;
  name: string;
  sipExtension: string | null;
  dialerStatus: string;
}

export interface LookupRepResult {
  ok: boolean;
  rep?: Rep;
  reason?: string;
}

export interface DialerDeps {
  n8nInstanceUrl: string;
  fetchImpl?: typeof fetch;
}

async function postJson(url: string, body: unknown, fetchImpl: typeof fetch): Promise<{ status: number; body: any }> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed: any = {};
  try {
    parsed = await res.json();
  } catch {
    parsed = { ok: false, reason: `Non-JSON response (status ${res.status}).` };
  }
  return { status: res.status, body: parsed };
}

/** rep-lookup.workflow.json - resolves the viewer's Cloudflare-Access-verified email to a Twenty
 * CRM Rep record. Called lazily (inside handleGetNextCall), not on every /dialer page render, so a
 * quiet idle page load never depends on n8n being reachable. */
export async function lookupRep(email: string, deps: DialerDeps): Promise<LookupRepResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const { status, body } = await postJson(`${deps.n8nInstanceUrl}/webhook/rep-lookup`, { email }, fetchImpl);
    if (status === 200 && body.ok) return { ok: true, rep: body.rep };
    return { ok: false, reason: body.reason ?? `Rep lookup returned ${status}.` };
  } catch (err) {
    return { ok: false, reason: `Could not reach the rep-lookup workflow: ${(err as Error).message}` };
  }
}

export interface GetNextCallInput {
  repId: string;
  campaignId?: string;
  dialerMode: string;
}
export interface ActiveCallState {
  hopperEntryId: string;
  opportunityId: string;
  locationId: string | null;
  companyName: string;
  phone: string | null;
  dialerMode: string;
  wave: number;
  attemptCountThisWave: number;
  lastAttemptDate: string | null;
  firstAttemptDateThisWave: string | null;
  attemptCountToday: number;
  repId: string;
  repSipExtension: string | null;
}
export interface GetNextCallResult {
  ok: boolean;
  call?: ActiveCallState;
  /** True when this is a recovered open claim (a rep refreshed mid-call) rather than a freshly
   * claimed entry - the UI shows a slightly different banner, but the wrap-up flow is identical. */
  recovered?: boolean;
  reason?: string;
  /** True specifically for "no eligible entry right now" - distinct from a real error, so the UI
   * can show a calm "nothing to dial" state instead of an error banner. */
  empty?: boolean;
}

/** hopper-request-next.workflow.json (W3.1). On a 409 "you already have an open claim," this
 * recovers gracefully using the hopperEntry the error body already carries - the UI can't show the
 * nicer company-name/phone display fields in that case (the 409 response doesn't include the
 * Opportunity/Location), which is an accepted degradation for what should be a rare page-refresh
 * edge case, not the normal path. */
export async function getNextCall(rep: Rep, input: GetNextCallInput, deps: DialerDeps): Promise<GetNextCallResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const { status, body } = await postJson(`${deps.n8nInstanceUrl}/webhook/hopper-request-next`, input, fetchImpl);

    if (status === 200 && body.ok) {
      return {
        ok: true,
        call: {
          hopperEntryId: body.hopperEntry?.id,
          opportunityId: body.opportunity?.id ?? body.hopperEntry?.opportunityId,
          locationId: body.location?.id ?? null,
          companyName: body.opportunity?.companyName ?? 'Unknown company',
          phone: body.location?.phone ?? null,
          dialerMode: input.dialerMode,
          wave: body.hopperEntry?.wave ?? 1,
          attemptCountThisWave: body.hopperEntry?.attemptCountThisWave ?? 0,
          lastAttemptDate: body.hopperEntry?.lastAttemptDate ?? null,
          firstAttemptDateThisWave: body.hopperEntry?.firstAttemptDateThisWave ?? null,
          attemptCountToday: body.hopperEntry?.attemptCountToday ?? 0,
          repId: rep.id,
          repSipExtension: rep.sipExtension,
        },
      };
    }

    if (status === 409 && body.hopperEntry) {
      return {
        ok: true,
        recovered: true,
        call: {
          hopperEntryId: body.hopperEntry.id,
          opportunityId: body.hopperEntry.opportunityId,
          locationId: null,
          companyName: '(resuming an in-progress call - details unavailable, see Twenty CRM)',
          phone: null,
          dialerMode: input.dialerMode,
          wave: body.hopperEntry.wave ?? 1,
          attemptCountThisWave: body.hopperEntry.attemptCountThisWave ?? 0,
          lastAttemptDate: body.hopperEntry.lastAttemptDate ?? null,
          firstAttemptDateThisWave: body.hopperEntry.firstAttemptDateThisWave ?? null,
          attemptCountToday: body.hopperEntry.attemptCountToday ?? 0,
          repId: rep.id,
          repSipExtension: rep.sipExtension,
        },
      };
    }

    if (!body.ok && !body.hopperEntry) {
      return { ok: false, empty: true, reason: body.message ?? 'No calls available right now.' };
    }

    return { ok: false, reason: body.message ?? `hopper-request-next returned ${status}.` };
  } catch (err) {
    return { ok: false, reason: `Could not reach hopper-request-next: ${(err as Error).message}` };
  }
}

export interface PlaceCallResult {
  ok: boolean;
  dialing?: boolean;
  reason?: string;
}

/** dialer-place-call.workflow.json (Phase 5/W5.2). A 403 here means DNC or compliant-hours blocked
 * the dial - the UI surfaces the reason and still lets the rep disposition the entry (e.g. as
 * NoAnswer or OptOut, per the rep's own judgment), it just never actually placed a call. */
export async function placeCall(call: ActiveCallState, deps: DialerDeps): Promise<PlaceCallResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const { status, body } = await postJson(
      `${deps.n8nInstanceUrl}/webhook/dialer-place-call`,
      {
        hopperEntryId: call.hopperEntryId,
        opportunityId: call.opportunityId,
        locationId: call.locationId,
        repId: call.repId,
        repSipExtension: call.repSipExtension,
        phoneNumber: call.phone,
        dialerMode: call.dialerMode,
      },
      fetchImpl,
    );
    if (status === 200 && body.ok) return { ok: true, dialing: true };
    return { ok: false, reason: body.reason ?? `dialer-place-call returned ${status}.` };
  } catch (err) {
    return { ok: false, reason: `Could not reach dialer-place-call: ${(err as Error).message}` };
  }
}

export interface WrapUpInput {
  callNote: string;
  disposition: string;
  scheduledAt?: string;
}
export interface WrapUpResult {
  ok: boolean;
  reason?: string;
}

/** call-wrap-up.workflow.json (W3.6) - submitting this is what "unlocks moving to the next call,"
 * per that workflow's own notes; hopper-request-next refuses a new claim until this has run. */
export async function wrapUpCall(call: ActiveCallState, input: WrapUpInput, deps: DialerDeps): Promise<WrapUpResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const { status, body } = await postJson(
      `${deps.n8nInstanceUrl}/webhook/call-wrap-up`,
      {
        hopperEntryId: call.hopperEntryId,
        opportunityId: call.opportunityId,
        repId: call.repId,
        callNote: input.callNote,
        disposition: input.disposition,
        scheduledAt: input.scheduledAt || undefined,
        attemptCountThisWave: call.attemptCountThisWave,
        wave: call.wave,
        lastAttemptDate: call.lastAttemptDate,
        firstAttemptDateThisWave: call.firstAttemptDateThisWave,
        attemptCountToday: call.attemptCountToday,
      },
      fetchImpl,
    );
    if (status === 200 && body.ok) return { ok: true };
    return { ok: false, reason: body.reason ?? `call-wrap-up returned ${status}.` };
  } catch (err) {
    return { ok: false, reason: `Could not reach call-wrap-up: ${(err as Error).message}` };
  }
}
