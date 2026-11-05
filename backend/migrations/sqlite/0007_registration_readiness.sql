CREATE TABLE registration_readiness (
 fingerprint TEXT PRIMARY KEY,
 report TEXT NOT NULL DEFAULT '[]',
 checked_at INTEGER NOT NULL DEFAULT 0,
 automatic_ok INTEGER NOT NULL DEFAULT 0,
 human_verified_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE readiness_interactions (
 ticket_hash TEXT PRIMARY KEY,
 fingerprint TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 email TEXT,
 code_hash TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 captcha_verified INTEGER NOT NULL DEFAULT 0,
 consumed INTEGER NOT NULL DEFAULT 0
);
