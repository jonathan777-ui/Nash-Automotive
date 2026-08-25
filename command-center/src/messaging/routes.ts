import { escapeHtml } from '../util.js';
import { parseMentions } from './mentions.js';
import {
  createChannel,
  getOrCreateThread,
  listChannels,
  listComments,
  listMessages,
  listRecentAlerts,
  postComment,
  postMessage,
  recordAlert,
  type D1Like,
} from './db.js';

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
  .alert-row { border-top: 1px solid #1c2c42; padding: 8px 0; font-size: 12px; }
  .alert-row .sev-critical { color: #fda4af; }
  .alert-row .sev-warning { color: #f6a609; }
  .alert-row .sev-info { color: #90b3cf; }
  .empty { color: #52688a; font-size: 13px; }
`;

function renderMentions(body: string): string {
  return escapeHtml(body).replace(/@([a-zA-Z0-9._-]+)/g, '<span class="mention">@$1</span>');
}

function pageShell(title: string, body: string, poll?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — Orbit Command Center</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="shell">${body}</div>
  ${poll ? `<script>setInterval(() => { fetch(location.href).then(r => r.text()).then(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    document.getElementById('${poll}').innerHTML = doc.getElementById('${poll}').innerHTML;
  }); }, 5000);</script>` : ''}
</body>
</html>`;
}

export async function handleMessagingPage(request: Request, db: D1Like): Promise<Response> {
  const url = new URL(request.url);
  const channels = await listChannels(db);
  const activeId = url.searchParams.get('channel') ?? channels[0]?.id;
  const messages = activeId ? await listMessages(db, activeId) : [];
  const alerts = await listRecentAlerts(db, 10);
  const activeChannel = channels.find((c) => c.id === activeId);

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
      <h1 style="margin-top:24px">Recent alerts</h1>
      <div id="alerts">
        ${
          alerts.length
            ? alerts
                .map(
                  (a) =>
                    `<div class="alert-row"><span class="sev-${escapeHtml(a.severity)}">[${escapeHtml(a.severity.toUpperCase())}]</span> ${escapeHtml(a.source)}: ${escapeHtml(a.message)}</div>`,
                )
                .join('')
            : '<span class="empty">No alerts yet.</span>'
        }
      </div>
    </div>`;

  const main = `
    <div class="card">
      <h1>${activeChannel ? '#' + escapeHtml(activeChannel.name) : 'No channel selected'}</h1>
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
  const opportunityId = url.searchParams.get('opportunityId') ?? '';
  if (!opportunityId) return new Response('Missing ?opportunityId=', { status: 400 });

  const thread = await getOrCreateThread(db, opportunityId);
  const comments = await listComments(db, thread.id);

  const main = `
    <div class="card" style="grid-column: 1 / -1">
      <h1>Comment thread — Opportunity ${escapeHtml(opportunityId)}</h1>
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
        <input type="hidden" name="opportunityId" value="${escapeHtml(opportunityId)}">
        <input type="text" name="body" placeholder="Comment (use @name to mention)" required>
        <button type="submit">Comment</button>
      </form>
    </div>`;

  return new Response(pageShell(`Thread — ${opportunityId}`, main, 'comments'), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function handlePostComment(request: Request, db: D1Like, authorEmail: string): Promise<Response> {
  const form = await request.formData();
  const opportunityId = String(form.get('opportunityId') ?? '');
  const body = String(form.get('body') ?? '');
  try {
    const thread = await getOrCreateThread(db, opportunityId);
    await postComment(db, thread.id, authorEmail, body);
    return Response.redirect(
      new URL(`/messaging/thread?opportunityId=${encodeURIComponent(opportunityId)}`, request.url).toString(),
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

  await recordAlert(db, body.severity, body.source, body.message);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}
