import { describe, expect, it, vi } from 'vitest';
import { getNextCall, lookupRep, placeCall, wrapUpCall, type ActiveCallState, type Rep } from '../../src/dialer/n8nClient.js';

const deps = { n8nInstanceUrl: 'https://n8n.example.com' };

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const rep: Rep = { id: 'rep-1', name: 'Jane', sipExtension: '101', dialerStatus: 'Available' };

describe('lookupRep', () => {
  it('returns the rep on success', async () => {
    const fetchImpl = fakeFetch(200, { ok: true, rep });
    const result = await lookupRep('jane@orbitaiautomation.com', { ...deps, fetchImpl });
    expect(result).toEqual({ ok: true, rep });
  });

  it('returns a failure reason on a 404', async () => {
    const fetchImpl = fakeFetch(404, { ok: false, reason: 'No Rep found.' });
    const result = await lookupRep('nobody@example.com', { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('No Rep found.');
  });

  it('fails cleanly when the network call throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await lookupRep('jane@orbitaiautomation.com', { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('network down');
  });
});

describe('getNextCall', () => {
  it('maps a successful claim into an ActiveCallState', async () => {
    const fetchImpl = fakeFetch(200, {
      ok: true,
      source: 'pool',
      hopperEntry: { id: 'he-1', wave: 2, attemptCountThisWave: 1, lastAttemptDate: '2026-08-20', firstAttemptDateThisWave: '2026-08-10', attemptCountToday: 1 },
      opportunity: { id: 'opp-1', companyName: 'Track Dog Racing' },
      location: { id: 'loc-1', phone: '+15551234567' },
    });
    const result = await getNextCall(rep, { repId: rep.id, dialerMode: 'Preview' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.call).toMatchObject({
      hopperEntryId: 'he-1',
      opportunityId: 'opp-1',
      locationId: 'loc-1',
      companyName: 'Track Dog Racing',
      phone: '+15551234567',
      wave: 2,
      repId: 'rep-1',
      repSipExtension: '101',
    });
  });

  it('recovers gracefully from a 409 open-claim response', async () => {
    const fetchImpl = fakeFetch(409, {
      ok: false,
      message: 'You already have a claimed HopperEntry pending disposition.',
      hopperEntry: { id: 'he-2', opportunityId: 'opp-2', wave: 1, attemptCountThisWave: 0, attemptCountToday: 0 },
    });
    const result = await getNextCall(rep, { repId: rep.id, dialerMode: 'Preview' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(true);
    expect(result.call?.hopperEntryId).toBe('he-2');
    expect(result.call?.opportunityId).toBe('opp-2');
  });

  it('reports an empty hopper distinctly from a real error', async () => {
    const fetchImpl = fakeFetch(200, { ok: false, message: 'No eligible HopperEntry available for this rep right now.' });
    const result = await getNextCall(rep, { repId: rep.id, dialerMode: 'Preview' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.empty).toBe(true);
  });

  it('fails cleanly when the network call throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await getNextCall(rep, { repId: rep.id, dialerMode: 'Preview' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('network down');
  });
});

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

describe('placeCall', () => {
  it('reports dialing:true on success', async () => {
    const fetchImpl = fakeFetch(200, { ok: true, dialing: true });
    const result = await placeCall(call, { ...deps, fetchImpl });
    expect(result).toEqual({ ok: true, dialing: true });
  });

  it('surfaces the block reason on a 403 (DNC/compliant-hours)', async () => {
    const fetchImpl = fakeFetch(403, { ok: false, reason: 'Blocked by DNC check.' });
    const result = await placeCall(call, { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Blocked by DNC check.');
  });
});

describe('wrapUpCall', () => {
  it('submits the full attempt-cadence contract from the call state', async () => {
    const fetchImpl = fakeFetch(200, { ok: true, hopperEntryResult: {} });
    await wrapUpCall(call, { callNote: 'Left a message', disposition: 'VoicemailLeft' }, { ...deps, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://n8n.example.com/webhook/call-wrap-up',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          hopperEntryId: 'he-1',
          opportunityId: 'opp-1',
          repId: 'rep-1',
          callNote: 'Left a message',
          disposition: 'VoicemailLeft',
          scheduledAt: undefined,
          attemptCountThisWave: 0,
          wave: 1,
          lastAttemptDate: null,
          firstAttemptDateThisWave: null,
          attemptCountToday: 0,
        }),
      }),
    );
  });

  it('fails cleanly on a 400 (missing required fields)', async () => {
    const fetchImpl = fakeFetch(400, { ok: false, reason: 'Call Note is required and cannot be empty.' });
    const result = await wrapUpCall(call, { callNote: '', disposition: 'NoAnswer' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Call Note is required and cannot be empty.');
  });
});
