CREATE TABLE mail_services (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 origin TEXT NOT NULL,
 runtime BLOB,
 revision INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX unique_service_origin ON mail_services(origin) WHERE origin<>'';
INSERT INTO mail_services(id,name,origin) VALUES ('default','默认邮件服务','');
CREATE TABLE mail_domains (
 id TEXT PRIMARY KEY,
 service_id TEXT NOT NULL REFERENCES mail_services(id),
 name TEXT NOT NULL,
 upstream_id TEXT NOT NULL,
 UNIQUE(id,service_id)
);
CREATE UNIQUE INDEX unique_mail_domain ON mail_domains(name) WHERE name<>'';
INSERT INTO mail_domains VALUES ('default','default','','');
CREATE TABLE platform_users_new (
 id BLOB PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 recovery_email TEXT NOT NULL UNIQUE,
 stalwart_id TEXT,
 status TEXT NOT NULL CHECK(status IN ('provisioning','active','disabled','reconcile')),
 operator INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER)),
 hourly_recipients INTEGER NOT NULL DEFAULT 10 CHECK(hourly_recipients>0),
 daily_recipients INTEGER NOT NULL DEFAULT 50 CHECK(daily_recipients>0),
 quota_bytes INTEGER NOT NULL DEFAULT 1073741824,
 challenge_id BLOB,
 display_name TEXT NOT NULL DEFAULT '',
 preferences TEXT NOT NULL DEFAULT '{"language":"zh-CN","theme":"system"}',
 provisioning_lease INTEGER NOT NULL DEFAULT 0,
 service_id TEXT NOT NULL DEFAULT 'default' REFERENCES mail_services(id),
 domain_id TEXT NOT NULL DEFAULT 'default',
 UNIQUE(service_id,stalwart_id),
 FOREIGN KEY(domain_id,service_id) REFERENCES mail_domains(id,service_id)
);
INSERT INTO platform_users_new(id,email,recovery_email,stalwart_id,status,operator,created_at,hourly_recipients,daily_recipients,quota_bytes,challenge_id,display_name,preferences,provisioning_lease)
 SELECT id,email,recovery_email,stalwart_id,status,operator,created_at,hourly_recipients,daily_recipients,quota_bytes,challenge_id,display_name,preferences,provisioning_lease FROM platform_users;
DROP TABLE platform_users;
ALTER TABLE platform_users_new RENAME TO platform_users;
CREATE UNIQUE INDEX unique_registration_challenge ON platform_users(challenge_id) WHERE challenge_id IS NOT NULL;
CREATE TABLE outbound_reservations_new (
 event_id TEXT NOT NULL,
 user_id BLOB NOT NULL REFERENCES platform_users(id),
 recipient_count INTEGER NOT NULL CHECK(recipient_count>0),
 created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER)),
 service_id TEXT NOT NULL DEFAULT 'default' REFERENCES mail_services(id),
 PRIMARY KEY(service_id,event_id)
);
INSERT INTO outbound_reservations_new(event_id,user_id,recipient_count,created_at) SELECT event_id,user_id,recipient_count,created_at FROM outbound_reservations;
DROP TABLE outbound_reservations;
ALTER TABLE outbound_reservations_new RENAME TO outbound_reservations;
CREATE INDEX outbound_user_window ON outbound_reservations(user_id,created_at);
ALTER TABLE verification_challenges ADD COLUMN domain_id TEXT NOT NULL DEFAULT 'default' REFERENCES mail_domains(id);
CREATE TABLE domain_policies(domain_id TEXT PRIMARY KEY REFERENCES mail_domains(id),value TEXT NOT NULL);
INSERT INTO domain_policies SELECT 'default',value FROM platform_settings WHERE key='registration';
ALTER TABLE readiness_interactions ADD COLUMN domain_id TEXT NOT NULL DEFAULT 'default' REFERENCES mail_domains(id);
ALTER TABLE audit_events ADD COLUMN domain_id TEXT NOT NULL DEFAULT 'default' REFERENCES mail_domains(id);
