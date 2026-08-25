import { escapeHtml } from '../util.js';
import { channelForSource } from './alertRouting.js';
import { parseMentions } from './mentions.js';
import {
  acknowledgeAlert,
  allocateDemoExtension,
  createAiActionRequest,
  createChannel,
  createNotification,
  getOrCreateThread,
  listAlertsForChannel,
  listChannels,
  listComments,
  listMessages,
  listNotificationsFor,
  listPendingAiActionRequests,
  listRecentAlerts,
  markNotificationRead,
  postComment,
  postMessage,
  recordAlert,
  resolveAiActionRequest,
  type AiActionRequest,
  type Alert,
  type D1Like,
  type Notification,
  type SubjectType,
} from './db.js';

const VALID_SUBJECT_TYPES: readonly SubjectType[] = ['lead', 'opportunity', 'location', 'company', 'organization'];

function isSubjectType(value: string): value is SubjectType {
  return (VALID_SUBJECT_TYPES as readonly string[]).includes(value);
}

const PAGE_STYLE = `
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a1628; color: #eaf3fb;
         margin: 0; padding: 32px 20px; }
  .shell { max-width: 960px; margin: 0 auto; display: grid; grid-template-columns: 200px 1fr; gap: 24px; }
  .card { padding: 20px 24px; border: 1px solid #1c2c42; border-radius: 16px; background: #0c1726; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  a { color: #7fe0ff; }
  .channel-list { display: flex; flex-direction: column; gap: 4px; }
  .channel-list a { padding: 6px 10px; border-radius: 8px; text-decoration: none; font-size: 13px; }
  .channel-list a.active { background: rgba(127,224,255,.12); }
  .msg { border-top: 1px solid #1c2c42; padding: 10px 0; font-size: 13px; }
  .msg:first-child { border-top: none; }
  .msg .meta { color: #52688a; font-size: 11px; margin-bottom: 3px; }
  .mention { color: #7fe0ff; font-weight: 600; }
  form.compose { display: flex; gap: 8px; margin-top: 16px; }
  input[type=text], textarea { flex: 1; background: #0a1422; border: 1px solid #1c2c42;
         border-radius: 8px; padding: 8px 10px; color: #eaf3fb; font-size: 13px; }
  button { background: linear-gradient(160deg,#1fb6ff,#0a8fd6); color: #04121f; font-weight: 700;
         border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
  button.secondary { background: #0a1422; color: #90b3cf; border: 1px solid #1c2c42; }
  .alert-row { border-top: 1px solid #1c2c42; padding: 8px 0; font-size: 12px; }
  .alert-row .sev-critical { color: #fda4af; }
  .alert-row .sev-warning { color: #f6a609; }
  .alert-row .sev-info { color: #90b3cf; }
  .alert-row .alert-link { display: inline-block; margin-top: 3px; font-size: 11px; }
  .alert-row .ack-form { margin-top: 4px; }
  .alert-row .ack-form button { padding: 3px 9px; font-size: 11px; }
  .alert-row .acked { display: inline-block; margin-top: 4px; font-size: 11px; color: #7fe8db; }
  .notif-row { border-top: 1px solid #1c2c42; padding: 8px 0; font-size: 12px; }
  .notif-row.unread { color: #eaf3fb; }
  .notif-row:not(.unread) { color: #52688a; }
  .notif-row form { display: inline; margin-left: 6px; }
  .notif-row form button { padding: 2px 7px; font-size: 10px; }
  .ai-action-row { border-top: 1px solid #1c2c42; padding: 8px 0; font-size: 12px; }
  .ai-action-row .badge-ai { display: inline-block; font-size: 10px; letter-spacing: .04em;
         text-transform: uppercase; color: #c9a7ff; border: 1px solid rgba(201,167,255,.4);
         border-radius: 999px; padding: 1px 7px; margin-right: 6px; }
  .ai-action-row .resolve-form { display: flex; gap: 6px; margin-top: 6px; }
  .ai-action-row .resolve-form button { padding: 3px 9px; font-size: 11px; }
  .btn-reject { background: #0a1422; color: #fda4af; border: 1px solid rgba(251,113,133,.35); }
  .hint { color: #52688a; font-size: 11px; }
  .empty { color: #52688a; font-size: 13px; }
`;

function renderMentions(body: string): string {
  return escapeHtml(body).replace(/@([a-zA-Z0-9._-]+)/g, '<span class="mention">@$1</span>');
}

/** Command Center is the PRIMARY, actionable alert surface (Google Chat is secondary/external-
 * visibility-only, see alert-dispatcher.workflow.json's W2.4 notes) - this is where that shows up:
 * a real deep link to the record when one was given, and an Acknowledge action that's the whole
 * point of an alert living somewhere a human can actually act on it, not just read it. */
function renderAlertRow(a: Alert): string {
  const link = a.linkUrl
    ? `<a class="alert-link" href="${escapeHtml(a.linkUrl)}" target="_blank" rel="noopener">Open record →</a>`
    : '';
  const action = a.acknowledgedBy
    ? `<span class="acked">✓ Acknowledged by ${escapeHtml(a.acknowledgedBy)}</span>`
    : `<form class="ack-form" method="post" action="/messaging/alerts/acknowledge">
         <input type="hidden" name="alertId" value="${escapeHtml(a.id)}">
         <button type="submit" class="secondary">Acknowledge</button>
       </form>`;
  return `<div class="alert-row">
    <span class="sev-${escapeHtml(a.severity)}">[${escapeHtml(a.severity.toUpperCase())}]</span>
    ${escapeHtml(a.source)}: ${escapeHtml(a.message)}<br>
    ${link}${action}
  </div>`;
}

/** Tag-for-Action (05 §14) — Step 5: the "personal notification" a human-to-human or human-to-AI
 * tag delivers. Unread rows render brighter; a "Mark read" button is the only action needed here -
 * the actual tag content (the note, the record it's about) already IS the notification's summary,
 * there's no separate detail page to click through to. */
function renderNotificationRow(n: Notification): string {
  const unread = !n.readAt;
  const link = n.linkUrl ? `<a href="${escapeHtml(n.linkUrl)}" target="_blank" rel="noopener">Open →</a> ` : '';
  const markRead = unread
    ? `<form method="post" action="/messaging/notifications/read">
         <input type="hidden" name="notificationId" value="${escapeHtml(n.id)}">
         <button type="submit" class="secondary">Mark read</button>
       </form>`
    : '';
  return `<div class="notif-row ${unread ? 'unread' : ''}">
    ${escapeHtml(n.summary)} ${link}${markRead}
  </div>`;
}

/** Tag-for-Action's human-approval gate for an @AI-employee tag classified external-send/billing/
 * irreversible (05 §14: "same human-approval gate regardless of trigger" as any other AI-employee
 * action of that class) - Approve/Reject here is the ONLY way one of these ever executes; nothing
 * in this codebase auto-approves. Visible to anyone with Command Center Access, since there's no
 * role/permission system built yet (same limitation already flagged for the messaging page overall)
 * - worth gating to admins specifically once Twenty CRM's real role model exists to key off. */
function renderAiActionRow(r: AiActionRequest): string {
  return `<div class="ai-action-row">
    <span class="badge-ai">AI request</span>${escapeHtml(r.action)} — ${escapeHtml(r.note)}
    ${r.opportunityId ? `<br><span class="hint">Opportunity ${escapeHtml(r.opportunityId)}</span>` : ''}
    <br><span class="hint">Requested by ${escapeHtml(r.requestedByEmail)}</span>
    <form class="resolve-form" method="post" action="/messaging/ai-actions/resolve">
      <input type="hidden" name="requestId" value="${escapeHtml(r.id)}">
      <button type="submit" name="decision" value="approve">Approve</button>
      <button type="submit" name="decision" value="reject" class="btn-reject">Reject</button>
    </form>
  </div>`;
}

function pageShell(title: string, body: string, poll?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — Orbit Command Center</title>
<style>${PAGE_STYLE}
  .top-nav { max-width: 960px; margin: 0 auto 12px; font-size: 12px; }
  .top-nav a { color: #7fe0ff; text-decoration: none; margin-right: 14px; }
</style>
</head>
<body>
  <div class="top-nav"><a href="/">Home</a><a href="/messaging">Team messaging</a><a href="/dialer">Dialer</a><a href="/deals-desk">Deals Desk</a></div>
  <div class="shell">${body}</div>
  ${poll ? `<script>setInterval(() => { fetch(location.href).then(r => r.text()).then(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    document.getElementById('${poll}').innerHTML = doc.getElementById('${poll}').innerHTML;
  }); }, 5000);</script>` : ''}
</body>
</html>`;
}

export async function handleMessagingPage(request: Request, db: D1Like, viewerEmail: string): Promise<Response> {
  const url = new URL(request.url);
  const channels = await listChannels(db);
  const activeId = url.searchParams.get('channel') ?? channels[0]?.id;
  const messages = activeId ? await listMessages(db, activeId) : [];
  const alerts = await listRecentAlerts(db, 10);
  const activeChannel = channels.find((c) => c.id === activeId);
  const channelAlerts = activeChannel ? await listAlertsForChannel(db, activeChannel.name, 10) : [];
  const notifications = await listNotificationsFor(db, viewerEmail, 10);
  const pendingAiActions = await listPendingAiActionRequests(db, 10);

  const sidebar = `
    <div class="card">
      <h1>Channels</h1>
      <div class="channel-list">
        ${channels
          .map(
            (c) =>
              `<a href="/messaging?channel=${encodeURIComponent(c.id)}" class="${c.id === activeId ? 'active' : ''}">#${escapeHtml(c.name)}</a>`,
          )
          .join('') || '<span class="empty">No channels yet.</span>'}
      </div>
      <form class="compose" method="post" action="/messaging/channels" style="margin-top:16px">
        <input type="text" name="name" placeholder="new-channel-name" required>
        <button type="submit">+</button>
      </form>
      <h1 style="margin-top:24px">🔔 Your notifications</h1>
      <div id="notifications">
        ${
          notifications.length
            ? notifications.map((n) => renderNotificationRow(n)).join('')
            : '<span class="empty">Nothing tagged to you.</span>'
        }
      </div>
      <h1 style="margin-top:24px">AI actions awaiting approval</h1>
      <div id="ai-actions">
        ${
          pendingAiActions.length
            ? pendingAiActions.map((r) => renderAiActionRow(r)).join('')
            : '<span class="empty">None pending.</span>'
        }
      </div>
      <h1 style="margin-top:24px">Recent alerts</h1>
      <div id="alerts">
        ${
          alerts.length
            ? alerts.map((a) => renderAlertRow(a)).join('')
            : '<span class="empty">No alerts yet.</span>'
        }
      </div>
    </div>`;

  const main = `
    <div class="card">
      <h1>${activeChannel ? '#' + escapeHtml(activeChannel.name) : 'No channel selected'}</h1>
      ${
        channelAlerts.length
          ? `<div id="channel-alerts" style="margin-bottom:14px">
               ${channelAlerts.map((a) => renderAlertRow(a)).join('')}
             </div>`
          : ''
      }
      <div id="messages">
        ${
          messages.length
            ? messages
                .map(
                  (m) =>
                    `<div class="msg"><div class="meta">${escapeHtml(m.authorEmail)} · ${escapeHtml(m.createdAt)}</div>${renderMentions(m.body)}</div>`,
                )
                .join('')
            : '<span class="empty">No messages yet — say hi.</span>'
        }
      </div>
      ${
        activeChannel
          ? `<form class="compose" method="post" action="/messaging/messages">
               <input type="hidden" name="channelId" value="${escapeHtml(activeChannel.id)}">
               <input type="text" name="body" placeholder="Message (use @name to mention)" required>
               <button type="submit">Send</button>
             </form>
             <h1 style="margin-top:20px">Tag for Action</h1>
             <form class="compose" method="post" action="/messaging/tag-for-action" style="flex-wrap:wrap">
               <select name="targetType" style="background:#0a1422;border:1px solid #1c2c42;border-radius:8px;color:#eaf3fb;padding:8px 10px;font-size:13px">
                 <option value="human">@ a teammate</option>
                 <option value="ai">@ AI-employee</option>
               </select>
               <input type="text" name="targetIdentifier" placeholder="username or email" required>
               <input type="text" name="action" placeholder="action (e.g. follow-up, draft-email)" required>
               <input type="text" name="opportunityId" placeholder="Opportunity ID (optional)">
               <input type="text" name="note" placeholder="note" required>
               <button type="submit">Tag</button>
             </form>`
          : ''
      }
    </div>`;

  return new Response(pageShell('Team messaging', sidebar + main, 'messages'), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function handleCreateChannel(request: Request, db: D1Like): Promise<Response> {
  const form = await request.formData();
  const name = String(form.get('name') ?? '');
  try {
    const channel = await createChannel(db, name);
    return Response.redirect(new URL(`/messaging?channel=${encodeURIComponent(channel.id)}`, request.url).toString(), 303);
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }
}

export async function handlePostMessage(request: Request, db: D1Like, authorEmail: string): Promise<Response> {
  const form = await request.formData();
  const channelId = String(form.get('channelId') ?? '');
  const body = String(form.get('body') ?? '');
  try {
    await postMessage(db, channelId, authorEmail, body, parseMentions(body));
    return Response.redirect(new URL(`/messaging?channel=${encodeURIComponent(channelId)}`, request.url).toString(), 303);
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }
}

export async function handleThreadPage(request: Request, db: D1Like): Promise<Response> {
  const url = new URL(request.url);
  const subjectTypeRaw = url.searchParams.get('subjectType') ?? '';
  const subjectId = url.searchParams.get('subjectId') ?? '';
  if (!isSubjectType(subjectTypeRaw) || !subjectId) {
    return new Response(
      `Missing or invalid ?subjectType=&subjectId= (subjectType must be one of: ${VALID_SUBJECT_TYPES.join(', ')}).`,
      { status: 400 },
    );
  }
  const subjectType = subjectTypeRaw;

  const thread = await getOrCreateThread(db, subjectType, subjectId);
  const comments = await listComments(db, thread.id);

  const main = `
    <div class="card" style="grid-column: 1 / -1">
      <h1>Comment thread — ${escapeHtml(subjectType)} ${escapeHtml(subjectId)}</h1>
      <div id="comments">
        ${
          comments.length
            ? comments
                .map(
                  (c) =>
                    `<div class="msg"><div class="meta">${escapeHtml(c.authorEmail)} · ${escapeHtml(c.createdAt)}</div>${renderMentions(c.body)}</div>`,
                )
                .join('')
            : '<span class="empty">No comments yet.</span>'
        }
      </div>
      <form class="compose" method="post" action="/messaging/threads/comments">
        <input type="hidden" name="subjectType" value="${escapeHtml(subjectType)}">
        <input type="hidden" name="subjectId" value="${escapeHtml(subjectId)}">
        <input type="text" name="body" placeholder="Comment (use @name to mention)" required>
        <button type="submit">Comment</button>
      </form>
    </div>`;

  return new Response(pageShell(`Thread — ${subjectType} ${subjectId}`, main, 'comments'), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function handlePostComment(request: Request, db: D1Like, authorEmail: string): Promise<Response> {
  const form = await request.formData();
  const subjectTypeRaw = String(form.get('subjectType') ?? '');
  const subjectId = String(form.get('subjectId') ?? '');
  const body = String(form.get('body') ?? '');
  if (!isSubjectType(subjectTypeRaw) || !subjectId) {
    return new Response(`Invalid subjectType (must be one of: ${VALID_SUBJECT_TYPES.join(', ')}) or missing subjectId.`, {
      status: 400,
    });
  }
  const subjectType = subjectTypeRaw;

  try {
    const thread = await getOrCreateThread(db, subjectType, subjectId);
    await postComment(db, thread.id, authorEmail, body);
    return Response.redirect(
      new URL(
        `/messaging/thread?subjectType=${encodeURIComponent(subjectType)}&subjectId=${encodeURIComponent(subjectId)}`,
        request.url,
      ).toString(),
      303,
    );
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }
}

export interface AlertIngestBody {
  severity: string;
  source: string;
  message: string;
  /** Optional deep link to the record the alert is about - new this pass, see Alert's own
   * comment in db.ts. Absent for alerts that aren't about a specific record. */
  linkUrl?: string;
}

/** Not gated by Cloudflare Access - n8n's alert-dispatcher workflow calls this machine-to-machine,
 * and can't complete an interactive Access login. Gated by a separate shared secret instead (see
 * index.ts's routing, which checks this BEFORE the Access verification that applies to every
 * human-facing route). */
export async function handleAlertsIngest(request: Request, db: D1Like): Promise<Response> {
  let body: Partial<AlertIngestBody>;
  try {
    body = (await request.json()) as Partial<AlertIngestBody>;
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'Invalid JSON body.' }), { status: 400 });
  }

  if (typeof body.severity !== 'string' || typeof body.source !== 'string' || typeof body.message !== 'string') {
    return new Response(
      JSON.stringify({ ok: false, reason: 'Body must be {severity, source, message} (all strings).' }),
      { status: 400 },
    );
  }
  if (body.linkUrl !== undefined && typeof body.linkUrl !== 'string') {
    return new Response(JSON.stringify({ ok: false, reason: 'linkUrl, if present, must be a string.' }), { status: 400 });
  }

  await recordAlert(db, body.severity, body.source, body.message, body.linkUrl ?? null, channelForSource(body.source));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Human-facing, Access-gated (routed alongside every other /messaging/* route in index.ts) -
 * unlike handleAlertsIngest above, which is the machine-to-machine write from n8n. This is the
 * "actionable" half of Command Center being the primary alert surface: a rep clicks Acknowledge
 * on the page they're already looking at, rather than an alert only ever being read passively. */
export async function handleAcknowledgeAlert(request: Request, db: D1Like, authorEmail: string): Promise<Response> {
  const form = await request.formData();
  const alertId = String(form.get('alertId') ?? '');
  if (!alertId) return new Response('Missing alertId.', { status: 400 });

  await acknowledgeAlert(db, alertId, authorEmail);
  return Response.redirect(new URL('/messaging', request.url).toString(), 303);
}

// ---------------------------------------------------------------------------------------------
// Tag-for-Action (05 §14) — Step 5
// ---------------------------------------------------------------------------------------------

/** The compose form's target: the durable record + AI classification/execution live in
 * tag-for-action.workflow.json (n8n) — same "every CRM write goes through n8n" architecture as
 * everything else in this repo. Command Center's own job is just collecting the form and forwarding
 * it server-to-server; n8n calls back into the two ingest endpoints below for the delivery layer
 * (a human's personal notification, or an AI-employee's pending-approval request). Best-effort,
 * fire-and-forget toward n8n — same as every other non-blocking write in this repo, a real failure
 * surfaces via that workflow's own errorWorkflow alert, not by blocking this redirect. */
export async function handlePostTagForAction(request: Request, n8nInstanceUrl: string, taggedByEmail: string): Promise<Response> {
  const form = await request.formData();
  const targetType = String(form.get('targetType') ?? '');
  const targetIdentifier = String(form.get('targetIdentifier') ?? '').trim();
  const action = String(form.get('action') ?? '').trim();
  const opportunityId = String(form.get('opportunityId') ?? '').trim() || null;
  const note = String(form.get('note') ?? '').trim();

  if ((targetType !== 'human' && targetType !== 'ai') || !targetIdentifier || !action || !note) {
    return new Response(
      'Tag for Action requires targetType (human/ai), targetIdentifier, action, and note.',
      { status: 400 },
    );
  }

  try {
    await fetch(`${n8nInstanceUrl || 'PLACEHOLDER_N8N_INSTANCE_URL'}/webhook/tag-for-action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetType, targetIdentifier, action, opportunityId, note, taggedByEmail }),
    });
  } catch {
    // n8n unreachable (placeholder URL, instance down) - don't fail the whole request over a
    // fire-and-forget forward; the tag is lost in that case, which is an honest limitation of a
    // best-effort call, not silently pretended to have worked.
  }

  return Response.redirect(new URL('/messaging', request.url).toString(), 303);
}

export interface NotificationIngestBody {
  recipientEmail: string;
  summary: string;
  linkUrl?: string;
}

/** Not gated by Cloudflare Access, same reasoning as handleAlertsIngest - tag-for-action.workflow.json
 * calls this machine-to-machine and can't complete an interactive Access login. Reuses
 * ALERTS_INGEST_SECRET rather than adding a second Wrangler secret - same trust boundary (any n8n
 * workflow authenticated to write into this Worker), no reason to fragment it. */
export async function handleNotificationsIngest(request: Request, db: D1Like): Promise<Response> {
  let body: Partial<NotificationIngestBody>;
  try {
    body = (await request.json()) as Partial<NotificationIngestBody>;
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'Invalid JSON body.' }), { status: 400 });
  }

  if (typeof body.recipientEmail !== 'string' || typeof body.summary !== 'string') {
    return new Response(
      JSON.stringify({ ok: false, reason: 'Body must be {recipientEmail, summary} (strings).' }),
      { status: 400 },
    );
  }
  if (body.linkUrl !== undefined && typeof body.linkUrl !== 'string') {
    return new Response(JSON.stringify({ ok: false, reason: 'linkUrl, if present, must be a string.' }), { status: 400 });
  }

  await createNotification(db, body.recipientEmail, body.summary, body.linkUrl ?? null);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}

export interface AiActionRequestIngestBody {
  action: string;
  note: string;
  requestedByEmail: string;
  opportunityId?: string;
}

/** Same machine-to-machine, ALERTS_INGEST_SECRET-gated pattern as the notification ingest above -
 * this is where an @AI-employee tag classified external-send/billing/irreversible lands, per 05
 * §14's human-approval gate. */
export async function handleAiActionRequestsIngest(request: Request, db: D1Like): Promise<Response> {
  let body: Partial<AiActionRequestIngestBody>;
  try {
    body = (await request.json()) as Partial<AiActionRequestIngestBody>;
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'Invalid JSON body.' }), { status: 400 });
  }

  if (typeof body.action !== 'string' || typeof body.note !== 'string' || typeof body.requestedByEmail !== 'string') {
    return new Response(
      JSON.stringify({ ok: false, reason: 'Body must be {action, note, requestedByEmail} (strings).' }),
      { status: 400 },
    );
  }
  if (body.opportunityId !== undefined && typeof body.opportunityId !== 'string') {
    return new Response(JSON.stringify({ ok: false, reason: 'opportunityId, if present, must be a string.' }), { status: 400 });
  }

  const created = await createAiActionRequest(db, body.action, body.note, body.requestedByEmail, body.opportunityId ?? null);
  return new Response(JSON.stringify({ ok: true, id: created.id }), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Human-facing, Access-gated - marks one of the viewer's OWN notifications read (markNotificationRead
 * is scoped to recipientEmail, so this can't be used to touch someone else's). */
export async function handleMarkNotificationRead(request: Request, db: D1Like, viewerEmail: string): Promise<Response> {
  const form = await request.formData();
  const notificationId = String(form.get('notificationId') ?? '');
  if (!notificationId) return new Response('Missing notificationId.', { status: 400 });

  await markNotificationRead(db, notificationId, viewerEmail);
  return Response.redirect(new URL('/messaging', request.url).toString(), 303);
}

/** Human-facing, Access-gated - Approve/Reject on a pending AI action request. This IS the human-
 * approval gate 05 §14 requires for an external-send/billing/irreversible AI-employee action;
 * nothing else in this codebase can move a request out of 'pending'. */
export async function handleResolveAiAction(request: Request, db: D1Like, resolvedByEmail: string): Promise<Response> {
  const form = await request.formData();
  const requestId = String(form.get('requestId') ?? '');
  const decision = String(form.get('decision') ?? '');
  if (!requestId || (decision !== 'approve' && decision !== 'reject')) {
    return new Response('Missing requestId or invalid decision (must be approve/reject).', { status: 400 });
  }

  await resolveAiActionRequest(db, requestId, resolvedByEmail, decision === 'approve');
  return Response.redirect(new URL('/messaging', request.url).toString(), 303);
}

// ---------------------------------------------------------------------------------------------
// Demo extension allocation (Phase 5, W5.3) — machine-to-machine, same ALERTS_INGEST_SECRET trust
// boundary as the other /api/* ingest routes above. Called by demo-extension-auto-assign.workflow.json
// right after a demo is generated (W1.2), fire-and-forget from that workflow's own success path.
// ---------------------------------------------------------------------------------------------

/** No request body needed - the counter is global, not scoped to anything the caller provides.
 * Returns the allocated extension as a number, not a string, so the caller doesn't have to parse it
 * before doing arithmetic/formatting on it (e.g. zero-padding for a dial-string). */
export async function handleAllocateDemoExtension(db: D1Like): Promise<Response> {
  try {
    const extension = await allocateDemoExtension(db);
    return new Response(JSON.stringify({ ok: true, extension }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, reason: (err as Error).message }), { status: 500 });
  }
}
