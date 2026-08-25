import { describe, expect, it } from 'vitest';
import { FakeD1 } from './fakeD1.js';
import {
  acknowledgeAlert,
  createChannel,
  getOrCreateThread,
  listAlertsForChannel,
  listChannels,
  listComments,
  listMessages,
  listRecentAlerts,
  postComment,
  postMessage,
  recordAlert,
} from '../../src/messaging/db.js';

describe('createChannel', () => {
  it('inserts a trimmed channel name and returns it with a generated id/timestamp', async () => {
    const db = new FakeD1();
    const channel = await createChannel(db, '  general  ');
    expect(channel.name).toBe('general');
    expect(channel.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(channel.createdAt).toString()).not.toBe('Invalid Date');

    const insertCall = db.calls.find((c) => c.sql.includes('INSERT INTO channels'));
    expect(insertCall?.params).toEqual([channel.id, 'general', channel.createdAt]);
  });

  it('rejects a blank name without touching the database', async () => {
    const db = new FakeD1();
    await expect(createChannel(db, '   ')).rejects.toThrow(/required/);
    expect(db.calls).toHaveLength(0);
  });
});

describe('listChannels', () => {
  it('returns whatever D1 gives back', async () => {
    const db = new FakeD1([{ results: [{ id: '1', name: 'general', createdAt: 't' }] }]);
    const channels = await listChannels(db);
    expect(channels).toEqual([{ id: '1', name: 'general', createdAt: 't' }]);
  });
});

describe('postMessage', () => {
  it('inserts the message once and one mention row per mention', async () => {
    const db = new FakeD1();
    const message = await postMessage(db, 'chan-1', 'jonathan@orbitaiautomation.com', 'hi @jonathan and @sam', [
      'jonathan',
      'sam',
    ]);

    expect(message.mentions).toEqual(['jonathan', 'sam']);
    expect(db.calls.filter((c) => c.sql.includes('INSERT INTO messages'))).toHaveLength(1);
    expect(db.calls.filter((c) => c.sql.includes('INSERT INTO mentions'))).toHaveLength(2);
  });

  it('rejects a blank body', async () => {
    const db = new FakeD1();
    await expect(postMessage(db, 'chan-1', 'a@b.com', '   ', [])).rejects.toThrow(/required/);
  });
});

describe('listMessages', () => {
  it('attaches mentions per message and returns chronological order', async () => {
    const db = new FakeD1([
      {
        results: [
          { id: 'm2', channelId: 'c', authorEmail: 'a@b.com', body: 'second', createdAt: '2026-01-02' },
          { id: 'm1', channelId: 'c', authorEmail: 'a@b.com', body: 'first', createdAt: '2026-01-01' },
        ],
      },
      { results: [{ mentioned_email: 'jonathan' }] }, // mentions for m2
      { results: [] }, // mentions for m1
    ]);

    const messages = await listMessages(db, 'c');
    expect(messages.map((m) => m.id)).toEqual(['m1', 'm2']); // reversed to chronological
    expect(messages[1]!.mentions).toEqual(['jonathan']);
    expect(messages[0]!.mentions).toEqual([]);
  });
});

describe('getOrCreateThread', () => {
  it('returns the existing thread without inserting when one already exists', async () => {
    const db = new FakeD1([{ results: [{ id: 't1', subjectType: 'opportunity', subjectId: 'opp-1', createdAt: 'x' }] }]);
    const thread = await getOrCreateThread(db, 'opportunity', 'opp-1');
    expect(thread.id).toBe('t1');
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO comment_threads'))).toBe(false);
  });

  it('creates a new thread when none exists yet', async () => {
    const db = new FakeD1([{ results: [] }]);
    const thread = await getOrCreateThread(db, 'opportunity', 'opp-2');
    expect(thread.subjectId).toBe('opp-2');
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO comment_threads'))).toBe(true);
  });

  it('keys threads by subject type as well as id — a location and an opportunity can share an id namespace safely', async () => {
    const db = new FakeD1([{ results: [] }]);
    await getOrCreateThread(db, 'location', 'loc-1');
    const insertCall = db.calls.find((c) => c.sql.includes('INSERT INTO comment_threads'));
    expect(insertCall?.params).toEqual([expect.any(String), 'location', 'loc-1', expect.any(String)]);
  });
});

describe('postComment / listComments', () => {
  it('round-trips through the fake', async () => {
    const db = new FakeD1([{ results: [{ id: 'c1', threadId: 't1', authorEmail: 'a@b.com', body: 'looks good', createdAt: 'x' }] }]);
    const comment = await postComment(db, 't1', 'a@b.com', 'looks good');
    expect(comment.body).toBe('looks good');

    const comments = await listComments(db, 't1');
    expect(comments).toEqual([{ id: 'c1', threadId: 't1', authorEmail: 'a@b.com', body: 'looks good', createdAt: 'x' }]);
  });
});

describe('recordAlert / listRecentAlerts', () => {
  it('round-trips through the fake, including a null linkUrl by default', async () => {
    const db = new FakeD1([
      {
        results: [
          {
            id: 'a1',
            severity: 'critical',
            source: 'w1',
            message: 'oops',
            createdAt: 'x',
            linkUrl: null,
            acknowledgedBy: null,
            acknowledgedAt: null,
          },
        ],
      },
    ]);
    const alert = await recordAlert(db, 'critical', 'w1', 'oops');
    expect(alert.severity).toBe('critical');
    expect(alert.linkUrl).toBeNull();
    expect(alert.acknowledgedBy).toBeNull();

    const alerts = await listRecentAlerts(db);
    expect(alerts[0]!.linkUrl).toBeNull();
    expect(alerts[0]!.acknowledgedBy).toBeNull();
  });

  it('stores a given linkUrl and channel, and includes both in the INSERT params', async () => {
    const db = new FakeD1();
    const alert = await recordAlert(db, 'warning', 'w2', 'check this', 'https://crm.example/opportunities/123', 'dialer');
    expect(alert.linkUrl).toBe('https://crm.example/opportunities/123');
    expect(alert.channel).toBe('dialer');

    const insertCall = db.calls.find((c) => c.sql.includes('INSERT INTO alerts'));
    expect(insertCall?.params).toEqual([
      alert.id,
      'warning',
      'w2',
      'check this',
      alert.createdAt,
      'https://crm.example/opportunities/123',
      'dialer',
    ]);
  });
});

describe('listAlertsForChannel', () => {
  it('queries by channel and returns whatever D1 gives back', async () => {
    const db = new FakeD1([{ results: [{ id: 'a1', severity: 'info', source: 'w1', message: 'x', createdAt: 't', channel: 'dialer' }] }]);
    const alerts = await listAlertsForChannel(db, 'dialer');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.channel).toBe('dialer');

    const selectCall = db.calls.find((c) => c.sql.includes('WHERE channel'));
    expect(selectCall?.params[0]).toBe('dialer');
  });
});

describe('acknowledgeAlert', () => {
  it('returns true when the UPDATE actually changed a row (first to acknowledge)', async () => {
    const db = new FakeD1([], [{ success: true, meta: { changes: 1 } }]);
    const acknowledged = await acknowledgeAlert(db, 'a1', 'jonathan@orbitaiautomation.com');
    expect(acknowledged).toBe(true);

    const updateCall = db.calls.find((c) => c.sql.includes('UPDATE alerts'));
    expect(updateCall?.sql).toContain('acknowledged_by IS NULL');
    expect(updateCall?.params).toEqual(['jonathan@orbitaiautomation.com', expect.any(String), 'a1']);
  });

  it('returns false when the alert was already acknowledged (no rows changed)', async () => {
    const db = new FakeD1([], [{ success: true, meta: { changes: 0 } }]);
    const acknowledged = await acknowledgeAlert(db, 'a1', 'someone-else@orbitaiautomation.com');
    expect(acknowledged).toBe(false);
  });
});
