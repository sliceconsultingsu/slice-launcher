-- Member apps: apps a member makes and publishes through the launcher (docs/member-apps.md).
-- Adding these tables changes nobody's access and no existing app.

-- One row per app ever created, holding a JSON document like app_settings does. A deleted app
-- keeps its row, so its ID is never given to another app.
CREATE TABLE member_apps (
  id TEXT PRIMARY KEY, -- Also the app's address: https://<id>.<launcher host>.
  document TEXT NOT NULL CHECK (json_valid(document)) -- See MemberApp in src/membership/contracts.ts.
);

-- One row per published version: who published it, when, its guide and the list of its files.
-- The files themselves are in the launcher's file store, not in this database.
CREATE TABLE member_app_versions (
  app_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document)), -- See VersionRecord in src/membership/contracts.ts.
  PRIMARY KEY (app_id, version)
);

-- One-time passes that carry a signed-in person from the launcher to one app's address. Only a
-- SHA-256 hash of each pass is stored. A pass is deleted when it is used.
CREATE TABLE app_passes (
  hash TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  session_hash TEXT NOT NULL, -- The launcher session (sessions.hash) the pass was issued to.
  expires_at TEXT NOT NULL
);
CREATE INDEX app_passes_expires ON app_passes(expires_at);

-- A person's session at one app's address. Only a hash of its token is stored. It is valid only
-- while the launcher session it came from still exists, so signing out of the launcher, being
-- suspended or being removed ends it at once.
CREATE TABLE app_sessions (
  hash TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX app_sessions_session ON app_sessions(session_hash);
CREATE INDEX app_sessions_expires ON app_sessions(expires_at);
