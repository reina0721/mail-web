ALTER TABLE platform_users ADD COLUMN challenge_id BLOB;
CREATE UNIQUE INDEX unique_registration_challenge ON platform_users(challenge_id) WHERE challenge_id IS NOT NULL;
