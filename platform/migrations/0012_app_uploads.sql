-- One-time upload addresses for member apps (docs/member-apps.md). A member's AI asks for one,
-- then sends the app's files to it from a terminal. Only a SHA-256 hash of each address's token
-- is stored. A row is deleted when the address is used, and expires after ten minutes.
CREATE TABLE app_uploads (
  hash TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  subject TEXT NOT NULL, -- The member the address was made for; checked again when it is used.
  email TEXT NOT NULL COLLATE NOCASE,
  preview INTEGER NOT NULL DEFAULT 0, -- 1: publish as a preview.
  expires_at TEXT NOT NULL
);
CREATE INDEX app_uploads_expires ON app_uploads(expires_at);
