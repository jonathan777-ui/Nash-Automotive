import type { ActiveCallState } from './n8nClient.js';

/** The `/dialer` page is stateless server-rendered HTML (same architecture as `/messaging` - no
 * client-side framework, no server session store) - the in-progress call's state round-trips
 * through a single opaque `state=` query param / hidden form field between actions, base64-encoded
 * JSON, same encoding Telnyx's own `client_state` mechanism uses in `dialer-place-call.workflow.json`.
 * Consistent reuse of a pattern already established in this repo, not a new one invented for this
 * page specifically. */

export function encodeCallState(call: ActiveCallState): string {
  return Buffer.from(JSON.stringify(call)).toString('base64');
}

export function decodeCallState(encoded: string): ActiveCallState | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.hopperEntryId || !parsed.opportunityId) return null;
    return parsed as ActiveCallState;
  } catch {
    return null;
  }
}
