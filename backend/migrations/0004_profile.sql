ALTER TABLE platform_users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_users ADD COLUMN preferences TEXT NOT NULL DEFAULT '{"language":"zh-CN","theme":"system"}';
