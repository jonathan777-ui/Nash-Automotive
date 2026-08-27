-- Command Center D1 schema (MESSAGING_DB binding).
--
-- Reconstructed from src/messaging/db.ts's actual queries — this file didn't previously exist
-- anywhere in the repo; the schema was only ever applied ad hoc against a different Cloudflare
-- account's D1 instance during an earlier build session (see DEPLOY.md's note on this). Run this
-- once against a freshly created D1 database via the Cloudflare dashboard's D1 Console (or
-- `wrangler d1 execute <db-name> --remote --file=schema.sql`).

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  author_email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages (channel_id, created_at);

CREATE TABLE IF NOT EXISTS mentions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  mentioned_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mentions_message ON mentions (message_id);

CREATE TABLE IF NOT EXISTS comment_threads (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_threads_subject ON comment_threads (subject_type, subject_id);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  author_email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_thread_created ON comments (thread_id, created_at);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  link_url TEXT,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  channel TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts (created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_channel_created ON alerts (channel, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  summary TEXT NOT NULL,
  link_url TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_email, read_at, created_at);

CREATE TABLE IF NOT EXISTS ai_action_requests (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  opportunity_id TEXT,
  note TEXT NOT NULL,
  requested_by_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by_email TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_action_requests_status_created ON ai_action_requests (status, created_at);

-- Single-row global counter, seeded at 1000 (Phase 5, W5.3 — allocateDemoExtension does a
-- compare-and-swap against this one row).
CREATE TABLE IF NOT EXISTS demo_extension_counter (
  id INTEGER PRIMARY KEY,
  next_extension INTEGER NOT NULL
);
INSERT INTO demo_extension_counter (id, next_extension) VALUES (1, 1000);

-- The 11-channel taxonomy (05 §14) — real channels from day one, not a placeholder "general" one.
-- Matches src/messaging/alertRouting.ts's ROUTES table + its 'system-alerts' fallback exactly.
INSERT INTO channels (id, name, created_at) VALUES
  (lower(hex(randomblob(16))), 'new-leads', datetime('now')),
  (lower(hex(randomblob(16))), 'demos', datetime('now')),
  (lower(hex(randomblob(16))), 'dialer', datetime('now')),
  (lower(hex(randomblob(16))), 'nurture', datetime('now')),
  (lower(hex(randomblob(16))), 'portal-conversion', datetime('now')),
  (lower(hex(randomblob(16))), 'onboarding', datetime('now')),
  (lower(hex(randomblob(16))), 'cx-retention', datetime('now')),
  (lower(hex(randomblob(16))), 'missed-follow-ups', datetime('now')),
  (lower(hex(randomblob(16))), 'system-alerts', datetime('now')),
  (lower(hex(randomblob(16))), 'ai-agents', datetime('now')),
  (lower(hex(randomblob(16))), 'accounting', datetime('now'));
