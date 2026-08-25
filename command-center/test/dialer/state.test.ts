import { describe, expect, it } from 'vitest';
import { decodeCallState, encodeCallState } from '../../src/dialer/state.js';
import type { ActiveCallState } from '../../src/dialer/n8nClient.js';

const call: ActiveCallState = {
  hopperEntryId: 'he-1',
  opportunityId: 'opp-1',
  locationId: 'loc-1',
  companyName: 'Track Dog Racing',
  phone: '+15551234567',
  dialerMode: 'Preview',
  wave: 1,
  attemptCountThisWave: 0,
  lastAttemptDate: null,
  firstAttemptDateThisWave: null,
  attemptCountToday: 0,
  repId: 'rep-1',
  repSipExtension: '101',
};

describe('encodeCallState/decodeCallState', () => {
  it('round-trips a call state through base64', () => {
    const encoded = encodeCallState(call);
    expect(decodeCallState(encoded)).toEqual(call);
  });

  it('returns null for garbage input rather than throwing', () => {
    expect(decodeCallState('not-valid-base64-json!!!')).toBeNull();
  });

  it('returns null when the decoded JSON is missing required fields', () => {
    const encoded = Buffer.from(JSON.stringify({ companyName: 'No IDs here' })).toString('base64');
    expect(decodeCallState(encoded)).toBeNull();
  });

  it('returns null for valid base64 that decodes to non-JSON', () => {
    const encoded = Buffer.from('not json at all').toString('base64');
    expect(decodeCallState(encoded)).toBeNull();
  });
});
