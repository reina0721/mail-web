ALTER TABLE credential_revocations ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0;
