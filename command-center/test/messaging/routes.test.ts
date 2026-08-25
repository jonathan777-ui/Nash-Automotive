import { describe, expect, it, vi } from 'vitest';
import { FakeD1 } from './fakeD1.js';
import {
  handleAcknowledgeAlert,
  handleAiActionRequestsIngest,
  handleAlertsIngest,
  handleMarkNotificationRead,
  handleNotificationsIngest,
  handlePostTagForAction,
  handleResolveAiAction,
} from '../../src/messaging/routes.js';

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

describe('handlePostTagForAction', () => {
  it('forwards a valid tag to the n8n webhook and redirects to /messaging', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const form = new URLSearchParams({
      targetType: 'human',
      targetIdentifier: 'sam',
      action: 'follow-up',
      opportunityId: 'opp-1',
      note: 'please call back',
    });
    const req = new Request('https://x/messaging/tag-for-action', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handlePostTagForAction(req, 'https://n8n.example', 'jonathan@orbitaiautomation.com');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/messaging');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://n8n.example/webhook/tag-for-action',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({
      targetType: 'human',
      targetIdentifier: 'sam',
      action: 'follow-up',
      opportunityId: 'opp-1',
      note: 'please call back',
      taggedByEmail: 'jonathan@orbitaiautomation.com',
    });
    fetchSpy.mockRestore();
  });

  it('still redirects even when the n8n call fails (best-effort, fire-and-forget)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unreachable'));
    const form = new URLSearchParams({ targetType: 'ai', targetIdentifier: 'ai-employee', action: 'summarize', note: 'x' });
    const req = new Request('https://x/messaging/tag-for-action', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handlePostTagForAction(req, 'https://n8n.example', 'jonathan@orbitaiautomation.com');
    expect(res.status).toBe(303);
    fetchSpy.mockRestore();
  });

  it('rejects a submission missing a required field', async () => {
    const form = new URLSearchParams({ targetType: 'human', targetIdentifier: 'sam', action: '', note: 'x' });
    const req = new Request('https://x/messaging/tag-for-action', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handlePostTagForAction(req, 'https://n8n.example', 'jonathan@orbitaiautomation.com');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid targetType', async () => {
    const form = new URLSearchParams({ targetType: 'robot', targetIdentifier: 'sam', action: 'x', note: 'x' });
    const req = new Request('https://x/messaging/tag-for-action', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handlePostTagForAction(req, 'https://n8n.example', 'jonathan@orbitaiautomation.com');
    expect(res.status).toBe(400);
  });
});

describe('handleNotificationsIngest', () => {
  it('accepts a valid body', async () => {
    const db = new FakeD1();
    const req = new Request('https://x/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ recipientEmail: 'a@b.com', summary: 'tagged you' }),
    });
    const res = await handleNotificationsIngest(req, db);
    expect(res.status).toBe(200);
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO notifications'))).toBe(true);
  });

  it('rejects a body missing recipientEmail', async () => {
    const db = new FakeD1();
    const req = new Request('https://x/api/notifications', { method: 'POST', body: JSON.stringify({ summary: 'x' }) });
    const res = await handleNotificationsIngest(req, db);
    expect(res.status).toBe(400);
  });
});

describe('handleAiActionRequestsIngest', () => {
  it('accepts a valid body', async () => {
    const db = new FakeD1();
    const req = new Request('https://x/api/ai-action-requests', {
      method: 'POST',
      body: JSON.stringify({ action: 'send-email', note: 'draft ready', requestedByEmail: 'a@b.com' }),
    });
    const res = await handleAiActionRequestsIngest(req, db);
    expect(res.status).toBe(200);
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO ai_action_requests'))).toBe(true);
  });

  it('rejects a body missing action', async () => {
    const db = new FakeD1();
    const req = new Request('https://x/api/ai-action-requests', {
      method: 'POST',
      body: JSON.stringify({ note: 'x', requestedByEmail: 'a@b.com' }),
    });
    const res = await handleAiActionRequestsIngest(req, db);
    expect(res.status).toBe(400);
  });
});

describe('handleMarkNotificationRead', () => {
  it('marks the notification read as the viewer and redirects', async () => {
    const db = new FakeD1([], [{ success: true, meta: { changes: 1 } }]);
    const form = new URLSearchParams({ notificationId: 'n1' });
    const req = new Request('https://x/messaging/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handleMarkNotificationRead(req, db, 'a@b.com');
    expect(res.status).toBe(303);
  });

  it('rejects a submission with no notificationId', async () => {
    const db = new FakeD1();
    const req = new Request('https://x/messaging/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    const res = await handleMarkNotificationRead(req, db, 'a@b.com');
    expect(res.status).toBe(400);
  });
});

describe('handleResolveAiAction', () => {
  it('approves a request and redirects', async () => {
    const db = new FakeD1([], [{ success: true, meta: { changes: 1 } }]);
    const form = new URLSearchParams({ requestId: 'r1', decision: 'approve' });
    const req = new Request('https://x/messaging/ai-actions/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handleResolveAiAction(req, db, 'reviewer@orbitaiautomation.com');
    expect(res.status).toBe(303);
    const updateCall = db.calls.find((c) => c.sql.includes('UPDATE ai_action_requests'));
    expect(updateCall?.params?.[0]).toBe('approved');
  });

  it('rejects a submission with an invalid decision', async () => {
    const db = new FakeD1();
    const form = new URLSearchParams({ requestId: 'r1', decision: 'maybe' });
    const req = new Request('https://x/messaging/ai-actions/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handleResolveAiAction(req, db, 'reviewer@orbitaiautomation.com');
    expect(res.status).toBe(400);
  });
});
