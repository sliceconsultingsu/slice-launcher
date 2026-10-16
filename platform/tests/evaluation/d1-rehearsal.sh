#!/usr/bin/env bash
# Area F scenario 10: LOCAL-ONLY D1 backup/restore rehearsal with synthetic data.
# Never uses --remote. Uses the locked project Wrangler with --local and a disposable
# --persist-to directory, plus a rehearsal config whose database_id is a placeholder, so no
# command here can address the real slice-membership database.
# Usage (from the repository root): bash platform/tests/evaluation/d1-rehearsal.sh
# Optional: REHEARSAL_DIR=<new empty directory> to keep the output; defaults to a fresh temporary directory.
set -euo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
W="$REPO/platform/node_modules/.bin/wrangler"
R=${REHEARSAL_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/slice-d1-rehearsal.XXXXXX")}
case "$R" in "" | "/" | "$HOME" | "$REPO"*) echo "Refusing unsafe rehearsal directory: $R" >&2; exit 1 ;; esac
# `wrangler d1 export --local` (4.147.0) rejects --persist-to and always reads the default local
# state next to the config file, so the primary rehearsal database lives at that default path.
P="$R/.wrangler/state"
DB=slice-membership
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CF_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL || true
export WRANGLER_SEND_METRICS=false CI=true NO_COLOR=1

now() { perl -MTime::HiRes=time -e 'printf "%.3f\n", time'; }
log() { printf '%s\n' "$*" | tee -a "$R/rehearsal.log"; }
timed() { # timed <label> <command...>
  local label=$1; shift
  local start end
  start=$(now)
  if "$@" >>"$R/rehearsal.log" 2>&1; then status=ok; else status=FAILED; fi
  end=$(now)
  log "$(printf '%-34s %-6s %6.2fs' "$label" "$status" "$(echo "$end - $start" | bc)")"
  [ "$status" = ok ]
}
wr() { "$W" "$@" --config "$R/wrangler.jsonc"; }
q() { wr d1 execute "$DB" --local --persist-to "$P" --json --command "$1" 2>/dev/null; }

rm -rf "$R"
mkdir -p "$R/backup"
: >"$R/rehearsal.log"
cp -R "$REPO/platform/migrations" "$R/migrations"
cat >"$R/wrangler.jsonc" <<'JSON'
{
  // Rehearsal copy of platform/wrangler.jsonc's D1 binding with a PLACEHOLDER database_id.
  "name": "slice-launcher-rehearsal",
  "compatibility_date": "2026-10-02",
  "d1_databases": [
    {
      "binding": "MEMBERSHIP_DB",
      "database_name": "slice-membership",
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations"
    }
  ]
}
JSON
log "wrangler $("$W" --version 2>/dev/null | tail -1); migrations sha256: $(shasum -a 256 "$R"/migrations/*.sql | awk '{print $1}' | tr '\n' ' ')"

# Synthetic data only (@example.test). Quotes, unicode, semicolons and same-`at` audits on purpose.
cat >"$R/seed.sql" <<'SQL'
UPDATE organization SET revision = 7, owner_email = 'owner@example.test', owner_claimed = 1 WHERE id = 'slice';
INSERT INTO access_levels(id, name, document) VALUES ('analyst', 'Analyst', '{"id":"analyst","name":"Analyst","permissions":["audit.read","members.read"]}');
INSERT INTO members(id, email, subject, document) VALUES
 ('m-owner', 'owner@example.test', 'https://eval.cloudflareaccess.com|owner', '{"id":"m-owner","subject":"https://eval.cloudflareaccess.com|owner","email":"owner@example.test","name":"Olive Owner","title":"","status":"active","levelId":"member","allow":[],"deny":[],"owner":true,"joinedAt":"2026-10-16T10:00:00.000Z"}'),
 ('m-obrien', 'obrien@example.test', 'https://eval.cloudflareaccess.com|obrien', '{"id":"m-obrien","subject":"https://eval.cloudflareaccess.com|obrien","email":"obrien@example.test","name":"Pat O''Brien","title":"Lead; Ops","status":"active","levelId":"analyst","allow":["members.manage"],"deny":[],"owner":false,"joinedAt":"2026-10-16T10:01:00.000Z"}'),
 ('m-zoe', 'zoe@example.test', 'https://eval.cloudflareaccess.com|zoe', '{"id":"m-zoe","subject":"https://eval.cloudflareaccess.com|zoe","email":"zoe@example.test","name":"Zoë Ünicode","title":"He said \"hi\"","status":"suspended","levelId":"member","allow":[],"deny":["members.read"],"owner":false,"joinedAt":"2026-10-16T10:02:00.000Z"}'),
 ('m-pending', 'pending@example.test', 'https://eval.cloudflareaccess.com|pending', '{"id":"m-pending","subject":"https://eval.cloudflareaccess.com|pending","email":"pending@example.test","name":"","title":"","status":"pending","levelId":null,"allow":[],"deny":[],"owner":false,"joinedAt":"2026-10-16T10:03:00.000Z"}'),
 ('m-invited', 'invited@example.test', NULL, '{"id":"m-invited","subject":null,"email":"invited@example.test","name":"Ivy Invited","title":"","status":"invited","levelId":"member","allow":[],"deny":[],"owner":false,"joinedAt":"2026-10-16T10:04:00.000Z"}');
INSERT INTO access_audit(id, at, document) VALUES
 ('a-7', '2026-10-16T10:00:00.000Z', '{"id":"a-7","at":"2026-10-16T10:00:00.000Z","actorId":"m-owner","action":"member.signin","targetId":"m-owner","before":null,"after":{}}'),
 ('a-3', '2026-10-16T10:01:00.000Z', '{"id":"a-3","at":"2026-10-16T10:01:00.000Z","actorId":"m-obrien","action":"member.signin","targetId":"m-obrien","before":null,"after":{}}'),
 ('a-5', '2026-10-16T10:02:00.000Z', '{"id":"a-5","at":"2026-10-16T10:02:00.000Z","actorId":"m-zoe","action":"member.signin","targetId":"m-zoe","before":null,"after":{}}'),
 ('a-1', '2026-10-16T10:05:00.000Z', '{"id":"a-1","at":"2026-10-16T10:05:00.000Z","actorId":"m-owner","action":"level.save","targetId":"analyst","before":null,"after":{}}'),
 ('a-9', '2026-10-16T10:05:00.000Z', '{"id":"a-9","at":"2026-10-16T10:05:00.000Z","actorId":"m-owner","action":"member.update","targetId":"m-obrien","before":{},"after":{}}'),
 ('a-2', '2026-10-16T10:05:00.000Z', '{"id":"a-2","at":"2026-10-16T10:05:00.000Z","actorId":"m-owner","action":"member.update","targetId":"m-zoe","before":{},"after":{}}'),
 ('a-4', '2026-10-16T10:06:00.000Z', '{"id":"a-4","at":"2026-10-16T10:06:00.000Z","actorId":"m-owner","action":"member.add","targetId":"m-invited","before":null,"after":{}}');
SQL

# One row of scalar subqueries (D1 caps compound SELECTs at 5 terms).
SNAPSHOT_SQL="SELECT
 (SELECT json_object('revision', revision, 'owner_email', owner_email, 'owner_claimed', owner_claimed) FROM organization) AS organization,
 json_object('members', (SELECT COUNT(*) FROM members), 'levels', (SELECT COUNT(*) FROM access_levels), 'audit', (SELECT COUNT(*) FROM access_audit), 'guard', (SELECT COUNT(*) FROM mutation_guard)) AS counts,
 (SELECT group_concat(id, ',') FROM (SELECT id FROM access_audit ORDER BY at DESC, rowid DESC)) AS history_order,
 (SELECT group_concat(id || '=' || email || '=' || ifnull(subject,'') || '=' || document, '|') FROM (SELECT * FROM members ORDER BY id)) AS members_docs,
 (SELECT group_concat(id || '=' || name || '=' || document, '|') FROM (SELECT * FROM access_levels ORDER BY id)) AS levels_docs,
 (SELECT group_concat(id || '=' || document, '|') FROM (SELECT * FROM access_audit ORDER BY id)) AS audit_docs,
 (SELECT group_concat(id || ':' || name, ',') FROM d1_migrations) AS ledger"

snapshot() { # snapshot <file>
  q "$SNAPSHOT_SQL" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const row = JSON.parse(s)[0].results[0];
      const out = {};
      for (const [k, v] of Object.entries(row)) out[k] = k.endsWith("_docs")
        ? require("node:crypto").createHash("sha256").update(String(v)).digest("hex") : v;
      process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    });' >"$1"
}

log "== 1. migrations on an empty local database"
timed "migrations apply (1st)" wr d1 migrations apply "$DB" --local --persist-to "$P"
timed "migrations apply (2nd)" wr d1 migrations apply "$DB" --local --persist-to "$P"
grep -q "No migrations to apply" "$R/rehearsal.log" && log "2nd apply: 'No migrations to apply' (idempotent)"
q "SELECT sql FROM sqlite_master WHERE name = 'd1_migrations'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].results[0].sql.replace(/\s+/g," ")))' >"$R/ledger-ddl.txt"
log "ledger DDL: $(cat "$R/ledger-ddl.txt")"

log "== 2. seed synthetic data and snapshot"
timed "seed synthetic rows" wr d1 execute "$DB" --local --persist-to "$P" --file "$R/seed.sql"
snapshot "$R/snapshot-before.json"
log "before: $(node -e 'const s=require(process.argv[1]);console.log(JSON.stringify({org:s.organization,counts:s.counts,order:s.history_order,ledger:s.ledger}))' "$R/snapshot-before.json")"

log "== 3. export (local)"
timed "d1 export --local" wr d1 export "$DB" --local --output "$R/backup/slice-membership-local.sql"
log "export: $(wc -c <"$R/backup/slice-membership-local.sql" | tr -d ' ') bytes, sha256 $(shasum -a 256 "$R/backup/slice-membership-local.sql" | awk '{print $1}')"
log "export tables: $(grep -oE 'CREATE TABLE [^ (]+' "$R/backup/slice-membership-local.sql" | awk '{print $3}' | tr '\n' ' ')"
log "export has d1_migrations rows: $(grep -c 'INSERT INTO "d1_migrations"' "$R/backup/slice-membership-local.sql" || true); IF NOT EXISTS used: $(grep -c 'IF NOT EXISTS' "$R/backup/slice-membership-local.sql" || true)"

log "== 4. wipe local data"
rm -rf "$P"
log "tables after wipe: $(q "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].results[0].n))')"

log "== 5. restore into an EMPTY database and verify"
timed "d1 execute --file (restore)" wr d1 execute "$DB" --local --persist-to "$P" --file "$R/backup/slice-membership-local.sql"
snapshot "$R/snapshot-after.json"
if diff -u "$R/snapshot-before.json" "$R/snapshot-after.json" >>"$R/rehearsal.log"; then
  log "VERIFY: restored snapshot identical (counts, revision, owner flags, audit order, document hashes, ledger)"
else
  log "VERIFY: MISMATCH (see diff above)"
fi
timed "migrations apply after restore" wr d1 migrations apply "$DB" --local --persist-to "$P"
log "post-restore apply: $(tail -5 "$R/rehearsal.log" | grep -o 'No migrations to apply' || echo 'migrations were re-applied')"

log "== 6. negative: restore over a NON-empty (already migrated) database"
P2="$R/state-nonempty"; P_SAVE=$P; P=$P2
timed "migrations apply (fresh target)" wr d1 migrations apply "$DB" --local --persist-to "$P"
timed "restore over existing schema" wr d1 execute "$DB" --local --persist-to "$P" --file "$R/backup/slice-membership-local.sql" || true
log "non-empty target after failed restore: $(q "SELECT (SELECT revision FROM organization) AS revision, (SELECT COUNT(*) FROM members) AS members" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0].results[0])))')"

log "== 7. negative: a restore file that fails on its LAST statement (atomic or partial?)"
P=$R/state-partial
cp "$R/backup/slice-membership-local.sql" "$R/backup/broken.sql"
printf '\nINSERT INTO no_such_table VALUES (1);\n' >>"$R/backup/broken.sql"
timed "restore with failing last stmt" wr d1 execute "$DB" --local --persist-to "$P" --file "$R/backup/broken.sql" || true
log "after failed restore: $(q "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0].results[0])))')"
P=$P_SAVE

log "== 8. Time Travel: remote-only in wrangler ('This command acts on remote D1 Databases'); NOT rehearsed (unverified)"
log "done; artifacts in $R"
