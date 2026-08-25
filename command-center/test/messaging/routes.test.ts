import { describe, expect, it } from 'vitest';
import { FakeD1 } from './fakeD1.js';
import { handleAcknowledgeAlert, handleAlertsIngest } from '../../src/messaging/routes.js';

describe('handleAlertsIngest — linkUrl', () => {
  it('accepts a body without linkUrl (unaffected by this pass)', async () => {
    const db = new FakeD1();
    const req = new Request('https://x/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ severity: 'info', source: 'test', message: 'hi' }),
    });
    const res = await handleAlertsIngest(req, db);
    expect(res.status).toBe(200);

    const insertCall = db.calls.find((c) => c.sql.includes('INSERT INTO alerts'));
    expect(insertCall?.params).toEqual([expect.any(String), 'info', 'test', 'hi', expect.any(String), null, 'system-alerts']);
  });

  it('accepts and stores a valid linkUrl, and computes the channel from source', async () => {
    const db = new FakeD1();
    const req = new Request('https://x/api/alerts', {
      method: 'POST',
      body: JSON.stringify({
        severity: 'critical',
        source: 'stripe-payment-to-crm',
        message: 'hi',
        linkUrl: 'https://crm.example/opp/1',
      }),
    });
    const res = await handleAlertsIngest(req, db);
    expect(res.status).toBe(200);

    const insertCall = db.calls.find((c) => c.sql.includes('INSERT INTO alerts'));
    expect(insertCall?.params?.[5]).toBe('https://crm.example/opp/1');
    expect(insertCall?.params?.[6]).toBe('portal-conversion');
  });

  it('rejects a non-string linkUrl', async () => {
    const db = new FakeD1();
    const req = new Request('https://x/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ severity: 'info', source: 'test', message: 'hi', linkUrl: 123 }),
    });
    const res = await handleAlertsIngest(req, db);
    expect(res.status).toBe(400);
  });
});

describe('handleAcknowledgeAlert', () => {
  it('acknowledges the given alertId as the authenticated user and redirects to /messaging', async () => {
    const db = new FakeD1([], [{ success: true, meta: { changes: 1 } }]);
    const form = new URLSearchParams({ alertId: 'a1' });
    const req = new Request('https://x/messaging/alerts/acknowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handleAcknowledgeAlert(req, db, 'jonathan@orbitaiautomation.com');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/messaging');

    const updateCall = db.calls.find((c) => c.sql.includes('UPDATE alerts'));
    expect(updateCall?.params).toEqual(['jonathan@orbitaiautomation.com', expect.any(String), 'a1']);
  });

  it('rejects a submission with no alertId', async () => {
    const db = new FakeD1();
    const req = new Request('https://x/messaging/alerts/acknowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    const res = await handleAcknowledgeAlert(req, db, 'jonathan@orbitaiautomation.com');
    expect(res.status).toBe(400);
  });
});
