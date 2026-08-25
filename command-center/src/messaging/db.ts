/** Minimal structural subset of Cloudflare's real D1Database/D1PreparedStatement types - lets
 * tests inject a fake without needing a real D1 binding or the full @cloudflare/workers-types
 * surface. The real D1Database satisfies this interface as-is (it's D1's actual, stable
 * prepare().bind().all()/.run()/.first() shape), so no adapter is needed in production. */
export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

function newId(): string {
  return crypto.randomUUID();
}
function nowIso(): string {
  return new Date().toISOString();
}

export interface Channel {
  id: string;
  name: string;
  createdAt: string;
}
export interface Message {
  id: string;
  channelId: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  mentions: string[];
}
/** Every subject type a comment thread can attach to, per CRM-OBJECT-MODEL.md — Communications Hub
 * (and comment threads with it) are explicitly polymorphic across these four in 05 §13, not
 * Opportunity-only. 'lead' is included even though nothing writes to it yet, since a thread could
 * reasonably start before a Lead becomes an Opportunity. */
export type SubjectType = 'lead' | 'opportunity' | 'location' | 'company' | 'organization';

export interface CommentThread {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  createdAt: string;
}
export interface Comment {
  id: string;
  threadId: string;
  authorEmail: string;
  body: string;
  createdAt: string;
}
export interface Alert {
  id: string;
  severity: string;
  source: string;
  message: string;
  createdAt: string;
  /** Deep link back to the record the alert is about (an Opportunity in Twenty CRM, a Location,
   * etc.) — new this pass, part of making Command Center the PRIMARY, actionable alert surface
   * (Google Chat is secondary/external-visibility-only, see alert-dispatcher.workflow.json). Null
   * for alerts that aren't about a specific record. */
  linkUrl: string | null;
  /** Who acknowledged this alert and when — null/null until someone does. First-to-acknowledge
   * wins (acknowledgeAlert only writes when these are still null); a repeat click on an already-
   * acknowledged alert is a no-op, not an overwrite. */
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  /** Which of the 11 taxonomy channels (`05 §14`) this alert belongs in, computed at ingest time
   * from `source` via `channelForSource` - new this pass. Nullable only for rows written before
   * this column existed; every new alert always gets one. */
  channel: string | null;
}

export async function createChannel(db: D1Like, name: string): Promise<Channel> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Channel name is required.');
  const channel: Channel = { id: newId(), name: trimmed, createdAt: nowIso() };
  await db
    .prepare('INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)')
    .bind(channel.id, channel.name, channel.createdAt)
    .run();
  return channel;
}

export async function listChannels(db: D1Like): Promise<Channel[]> {
  const { results } = await db
    .prepare('SELECT id, name, created_at AS createdAt FROM channels ORDER BY name')
    .bind()
    .all<Channel>();
  return results;
}

export async function postMessage(
  db: D1Like,
  channelId: string,
  authorEmail: string,
  body: string,
  mentions: string[],
): Promise<Message> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Message body is required.');
  const message: Message = { id: newId(), channelId, authorEmail, body: trimmed, createdAt: nowIso(), mentions };
  await db
    .prepare('INSERT INTO messages (id, channel_id, author_email, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(message.id, channelId, authorEmail, trimmed, message.createdAt)
    .run();
  for (const mention of mentions) {
    await db
      .prepare('INSERT INTO mentions (id, message_id, mentioned_email, created_at) VALUES (?, ?, ?, ?)')
      .bind(newId(), message.id, mention, message.createdAt)
      .run();
  }
  return message;
}

/** One extra query per message to fetch its mentions (N+1) rather than a JOIN + GROUP_CONCAT -
 * simple over clever for a low-volume internal chat tool; worth revisiting if message volume
 * ever makes this a real cost. */
export async function listMessages(db: D1Like, channelId: string, limit = 100): Promise<Message[]> {
  const { results } = await db
    .prepare(
      'SELECT id, channel_id AS channelId, author_email AS authorEmail, body, created_at AS createdAt ' +
        'FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .bind(channelId, limit)
    .all<Omit<Message, 'mentions'>>();

  const messages: Message[] = [];
  for (const row of results) {
    const { results: mentionRows } = await db
      .prepare('SELECT mentioned_email FROM mentions WHERE message_id = ?')
      .bind(row.id)
      .all<{ mentioned_email: string }>();
    messages.push({ ...row, mentions: mentionRows.map((m) => m.mentioned_email) });
  }
  return messages.reverse();
}

export async function getOrCreateThread(db: D1Like, subjectType: SubjectType, subjectId: string): Promise<CommentThread> {
  const existing = await db
    .prepare(
      'SELECT id, subject_type AS subjectType, subject_id AS subjectId, created_at AS createdAt ' +
        'FROM comment_threads WHERE subject_type = ? AND subject_id = ?',
    )
    .bind(subjectType, subjectId)
    .all<CommentThread>();
  if (existing.results[0]) return existing.results[0];

  const thread: CommentThread = { id: newId(), subjectType, subjectId, createdAt: nowIso() };
  await db
    .prepare('INSERT INTO comment_threads (id, subject_type, subject_id, created_at) VALUES (?, ?, ?, ?)')
    .bind(thread.id, thread.subjectType, thread.subjectId, thread.createdAt)
    .run();
  return thread;
}

export async function postComment(db: D1Like, threadId: string, authorEmail: string, body: string): Promise<Comment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Comment body is required.');
  const comment: Comment = { id: newId(), threadId, authorEmail, body: trimmed, createdAt: nowIso() };
  await db
    .prepare('INSERT INTO comments (id, thread_id, author_email, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(comment.id, threadId, authorEmail, trimmed, comment.createdAt)
    .run();
  return comment;
}

export async function listComments(db: D1Like, threadId: string): Promise<Comment[]> {
  const { results } = await db
    .prepare(
      'SELECT id, thread_id AS threadId, author_email AS authorEmail, body, created_at AS createdAt ' +
        'FROM comments WHERE thread_id = ? ORDER BY created_at ASC',
    )
    .bind(threadId)
    .all<Comment>();
  return results;
}

export async function recordAlert(
  db: D1Like,
  severity: string,
  source: string,
  message: string,
  linkUrl: string | null = null,
  channel: string | null = null,
): Promise<Alert> {
  const alert: Alert = {
    id: newId(),
    severity,
    source,
    message,
    createdAt: nowIso(),
    linkUrl,
    acknowledgedBy: null,
    acknowledgedAt: null,
    channel,
  };
  await db
    .prepare(
      'INSERT INTO alerts (id, severity, source, message, created_at, link_url, channel) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(alert.id, alert.severity, alert.source, alert.message, alert.createdAt, alert.linkUrl, alert.channel)
    .run();
  return alert;
}

const ALERT_SELECT =
  'SELECT id, severity, source, message, created_at AS createdAt, link_url AS linkUrl, ' +
  'acknowledged_by AS acknowledgedBy, acknowledged_at AS acknowledgedAt, channel FROM alerts';

export async function listRecentAlerts(db: D1Like, limit = 20): Promise<Alert[]> {
  const { results } = await db
    .prepare(`${ALERT_SELECT} ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all<Alert>();
  return results;
}

/** Alerts scoped to one channel - what a channel's own message view now also renders alongside its
 * chat messages, so #dialer (say) actually shows dialer alerts, not just whatever gets typed there. */
export async function listAlertsForChannel(db: D1Like, channel: string, limit = 20): Promise<Alert[]> {
  const { results } = await db
    .prepare(`${ALERT_SELECT} WHERE channel = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(channel, limit)
    .all<Alert>();
  return results;
}

/** First-to-acknowledge wins: only writes when the alert isn't already acknowledged, so a second
 * click (another rep, or a page double-submit) doesn't silently reassign who handled it. Returns
 * true if this call was the one that acknowledged it, false if it was already acknowledged (or
 * doesn't exist) — the caller doesn't currently branch on this, but it's honest about what
 * happened rather than reporting success either way. */
export async function acknowledgeAlert(db: D1Like, id: string, byEmail: string): Promise<boolean> {
  // D1's real .run() result includes meta.changes per Cloudflare's documented API - same
  // "documented assumption, not exercised against a live Worker" caveat as every other D1 query
  // in this file (DEPLOY.md's schema-applied-but-unverified note applies here too).
  const result = (await db
    .prepare('UPDATE alerts SET acknowledged_by = ?, acknowledged_at = ? WHERE id = ? AND acknowledged_by IS NULL')
    .bind(byEmail, nowIso(), id)
    .run()) as { meta?: { changes?: number } } | undefined;
  return (result?.meta?.changes ?? 0) > 0;
}

// ---------------------------------------------------------------------------------------------
// Tag-for-Action (05 §14) — Step 5. "@username (or @AI-employee) + action + company (autocomplete),
// OR Opportunity ID paste + @target + note. Human-to-human: personal notification + action button,
// logs to Activity Event. Human-to-AI: same mechanism — read-only/reversible = immediate response,
// external-send/billing/irreversible = same human-approval gate regardless of trigger." The durable
// record (the Activity Event itself) is written by tag-for-action.workflow.json directly to Twenty
// CRM, same pattern as every other Activity Event write in this repo (dnc-check's override log,
// contract-amendment-flow's audit event) — these two tables are Command Center's own DELIVERY
// layer: a personal notification a human target actually sees, and the pending-approval queue an
// AI-employee's gated action sits in until a human clears it.
// ---------------------------------------------------------------------------------------------

export interface Notification {
  id: string;
  recipientEmail: string;
  summary: string;
  linkUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

/** The "personal notification" half of Tag-for-Action's human-to-human/human-to-AI mechanism —
 * written by tag-for-action.workflow.json (machine-to-machine, same POST /api/notifications +
 * shared-secret pattern as POST /api/alerts) whenever the target is a real person (or an AI
 * response/approval-request comes back and someone needs to see it). */
export async function createNotification(
  db: D1Like,
  recipientEmail: string,
  summary: string,
  linkUrl: string | null = null,
): Promise<Notification> {
  const notification: Notification = { id: newId(), recipientEmail, summary, linkUrl, createdAt: nowIso(), readAt: null };
  await db
    .prepare('INSERT INTO notifications (id, recipient_email, summary, link_url, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(notification.id, notification.recipientEmail, notification.summary, notification.linkUrl, notification.createdAt)
    .run();
  return notification;
}

/** Unread-first, most recent first - a viewer's own notifications, scoped to their Access-verified
 * email so one person never sees another's personal tags. */
export async function listNotificationsFor(db: D1Like, recipientEmail: string, limit = 20): Promise<Notification[]> {
  const { results } = await db
    .prepare(
      'SELECT id, recipient_email AS recipientEmail, summary, link_url AS linkUrl, created_at AS createdAt, ' +
        'read_at AS readAt FROM notifications WHERE recipient_email = ? ' +
        'ORDER BY (read_at IS NOT NULL), created_at DESC LIMIT ?',
    )
    .bind(recipientEmail, limit)
    .all<Notification>();
  return results;
}

/** Scoped to the recipient, not just the id - a notification is only markable-read by the person it
 * was actually sent to, not by anyone who happens to know its id. */
export async function markNotificationRead(db: D1Like, id: string, recipientEmail: string): Promise<boolean> {
  const result = (await db
    .prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND recipient_email = ? AND read_at IS NULL')
    .bind(nowIso(), id, recipientEmail)
    .run()) as { meta?: { changes?: number } } | undefined;
  return (result?.meta?.changes ?? 0) > 0;
}

export interface AiActionRequest {
  id: string;
  action: string;
  opportunityId: string | null;
  note: string;
  requestedByEmail: string;
  status: 'pending' | 'approved' | 'rejected';
  resolvedByEmail: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/** The human-approval gate for an @AI-employee tag classified as external-send/billing/irreversible
 * — per 05 §14, "same human-approval gate regardless of trigger" as any other AI-employee action of
 * that class (the automation risk boundary this whole repo has followed since checkpoint 1).
 * Written by tag-for-action.workflow.json; NEVER auto-resolved by anything in this codebase. */
export async function createAiActionRequest(
  db: D1Like,
  action: string,
  note: string,
  requestedByEmail: string,
  opportunityId: string | null = null,
): Promise<AiActionRequest> {
  const request: AiActionRequest = {
    id: newId(),
    action,
    opportunityId,
    note,
    requestedByEmail,
    status: 'pending',
    resolvedByEmail: null,
    resolvedAt: null,
    createdAt: nowIso(),
  };
  await db
    .prepare(
      'INSERT INTO ai_action_requests (id, action, opportunity_id, note, requested_by_email, status, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(request.id, request.action, request.opportunityId, request.note, request.requestedByEmail, request.status, request.createdAt)
    .run();
  return request;
}

export async function listPendingAiActionRequests(db: D1Like, limit = 20): Promise<AiActionRequest[]> {
  const { results } = await db
    .prepare(
      'SELECT id, action, opportunity_id AS opportunityId, note, requested_by_email AS requestedByEmail, status, ' +
        'resolved_by_email AS resolvedByEmail, resolved_at AS resolvedAt, created_at AS createdAt ' +
        "FROM ai_action_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
    )
    .bind(limit)
    .all<AiActionRequest>();
  return results;
}

/** Only resolves a still-pending request (WHERE status = 'pending') - a second click (or a race
 * between two reviewers) can't flip an already-decided request. Returns false, not an error, when
 * that happens - same "honest about what happened, caller doesn't have to branch on it" shape as
 * acknowledgeAlert above. */
export async function resolveAiActionRequest(
  db: D1Like,
  id: string,
  resolvedByEmail: string,
  approved: boolean,
): Promise<boolean> {
  const result = (await db
    .prepare(
      "UPDATE ai_action_requests SET status = ?, resolved_by_email = ?, resolved_at = ? WHERE id = ? AND status = 'pending'",
    )
    .bind(approved ? 'approved' : 'rejected', resolvedByEmail, nowIso(), id)
    .run()) as { meta?: { changes?: number } } | undefined;
  return (result?.meta?.changes ?? 0) > 0;
}
