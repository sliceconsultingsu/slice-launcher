-- Browser sessions for Slice's own Google sign-in. Only a SHA-256 hash of each session token is
-- stored; the token itself lives only in the person's HttpOnly cookie.
CREATE TABLE sessions (
  hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX sessions_subject ON sessions(subject);
CREATE INDEX sessions_expires ON sessions(expires_at);
