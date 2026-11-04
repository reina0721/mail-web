ALTER TABLE platform_users ADD COLUMN hourly_recipients INTEGER NOT NULL DEFAULT 10 CHECK(hourly_recipients>0);
ALTER TABLE platform_users ADD COLUMN daily_recipients INTEGER NOT NULL DEFAULT 50 CHECK(daily_recipients>0);
ALTER TABLE platform_users ADD COLUMN quota_bytes INTEGER NOT NULL DEFAULT 1073741824;
ALTER TABLE verification_challenges ADD COLUMN claim_hash TEXT;
ALTER TABLE verification_challenges ADD COLUMN lease_until INTEGER;
CREATE TABLE request_limits(bucket TEXT PRIMARY KEY,window_start INTEGER NOT NULL,count INTEGER NOT NULL);
CREATE TABLE upload_ownership(user_id BLOB NOT NULL REFERENCES platform_users(id),blob_id TEXT NOT NULL,size INTEGER NOT NULL,type TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,blob_id));
CREATE TABLE credential_jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,user_id BLOB NOT NULL REFERENCES platform_users(id),payload TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0);
