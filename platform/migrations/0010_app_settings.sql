-- App settings: who can open each app and who runs it, set on the app's own page.
--
-- One row per app whose settings were ever saved, holding a JSON document like members and
-- access levels do: { id, visibility, managers, people }. An app with no row is private with
-- nobody added, so only owners can open it. Adding this table changes nobody's access.
CREATE TABLE app_settings (
  id TEXT PRIMARY KEY, -- The app's ID from its app.json, e.g. 'alumni'.
  document TEXT NOT NULL CHECK (json_valid(document)) -- The settings; see AppSettings in src/membership/contracts.ts.
);
