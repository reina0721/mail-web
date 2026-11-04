CREATE TABLE platform_users (
 id BLOB PRIMARY KEY,
 email text NOT NULL UNIQUE,
 recovery_email text NOT NULL UNIQUE,
 stalwart_id text UNIQUE,
 status text NOT NULL CHECK (status IN ('provisioning','active','disabled','reconcile')),
 operator INTEGER NOT NULL DEFAULT false,
 created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER))
);
CREATE TABLE sessions (
 id_hash text PRIMARY KEY,
 user_id BLOB NOT NULL REFERENCES platform_users(id),
 csrf_hash text NOT NULL,
 upstream_key bytea NOT NULL,
 upstream_key_id text NOT NULL,
 created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER)),
 expires_at INTEGER NOT NULL,
 last_seen INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER)),
 revoked_at INTEGER
);
CREATE TABLE credential_revocations (
 session_hash text PRIMARY KEY REFERENCES sessions(id_hash),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER)),
 last_error text
);
CREATE TABLE verification_challenges (
 id BLOB PRIMARY KEY, email text NOT NULL,
 purpose text NOT NULL CHECK (purpose IN ('registration','recovery')),
 code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0,
 expires_at INTEGER NOT NULL, verified_at INTEGER, consumed_at INTEGER
);
CREATE TABLE operations (
 id BLOB PRIMARY KEY, user_id BLOB REFERENCES platform_users(id),
 kind text NOT NULL, idempotency_key text NOT NULL,
 status text NOT NULL CHECK (status IN ('pending','succeeded','unknown','failed')),
 request_hash text NOT NULL, result TEXT,
 created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER)),
 UNIQUE(user_id,kind,idempotency_key)
);
CREATE TABLE outbound_reservations (
 event_id text PRIMARY KEY, user_id BLOB NOT NULL REFERENCES platform_users(id),
 recipient_count integer NOT NULL CHECK(recipient_count > 0),
 created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER))
);
CREATE INDEX outbound_user_window ON outbound_reservations(user_id,created_at);
CREATE TABLE platform_settings (key text PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO platform_settings VALUES ('registration','{"enabled":false,"maximumAccounts":100,"quotaBytes":1073741824,"attachmentBytes":20971520,"hourlyRecipients":10,"dailyRecipients":50}');
CREATE TABLE audit_events (
 id BLOB PRIMARY KEY, actor_id BLOB, action text NOT NULL,
 subject_id BLOB, outcome text NOT NULL, created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER))
);
