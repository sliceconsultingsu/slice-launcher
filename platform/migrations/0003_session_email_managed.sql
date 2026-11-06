-- Whether Google manages the session's email address (Gmail, or a Workspace account whose hosted
-- domain is the address's domain). Only such sessions may claim an invitation or the owner seat by
-- email. Existing rows default to 0, the safe value.
ALTER TABLE sessions ADD COLUMN email_managed INTEGER NOT NULL DEFAULT 0;
