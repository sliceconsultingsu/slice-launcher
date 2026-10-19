// Scenario 9: migrations applied twice and ledger compatibility with Wrangler's d1_migrations.
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_splitSqlQuery } from "wrangler";
import { database, migrate } from "../database";
import type { Fixture } from "./harness";

// Copied verbatim from wrangler 4.147.0 getCreateMigrationsTableQuery (wrangler-dist/cli.js).
const WRANGLER_LEDGER_DDL = `CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;

let runtimes: Fixture[] = [];
const fresh = async () => {
  const fixture = await database();
  runtimes.push(fixture);
  return fixture.db;
};
beforeAll(() => {
  runtimes = [];
});
afterAll(async () => {
  for (const fixture of runtimes) await fixture.runtime.dispose();
});

type Db = Fixture["db"];
const schema = async (db: Db) =>
  (
    await db
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all<{ type: string; name: string; sql: string }>()
  ).results;
const ledger = async (db: Db) =>
  (await db.prepare("SELECT id, name FROM d1_migrations ORDER BY id").all()).results;

describe("scenario 9: migrations", () => {
  it("applying all migrations twice is a no-op the second time (schema and ledger unchanged)", async () => {
    const db = await fresh();
    const files = await migrate(db);
    const firstSchema = await schema(db);
    const firstLedger = await ledger(db);
    await migrate(db);
    expect(await schema(db)).toEqual(firstSchema);
    expect(await ledger(db)).toEqual(firstLedger);
    expect(firstLedger).toEqual(files.map((name, index) => ({ id: index + 1, name })));
  }, 30_000);

  it("the test helper ledger has Wrangler's columns; only NOT NULL on name differs", async () => {
    const helper = await fresh();
    await migrate(helper);
    const wrangler = await fresh();
    await wrangler.prepare(WRANGLER_LEDGER_DDL).run();
    const info = async (db: Db) =>
      (
        await db.prepare("PRAGMA table_info(d1_migrations)").all<Record<string, unknown>>()
      ).results.map(({ name, type, notnull, pk }: Record<string, unknown>) => ({
        name,
        type,
        notnull,
        pk,
      }));
    const a = await info(helper);
    const b = await info(wrangler);
    expect(a.map((c: Record<string, unknown>) => [c.name, c.type, c.pk])).toEqual(
      b.map((c: Record<string, unknown>) => [c.name, c.type, c.pk]),
    );
    expect(a.find((c: Record<string, unknown>) => c.name === "name")?.notnull).toBe(1);
    expect(b.find((c: Record<string, unknown>) => c.name === "name")?.notnull).toBe(0);
  }, 30_000);

  it("a database migrated in Wrangler's format (ledger row present) is skipped by the helper", async () => {
    const db = await fresh();
    await db.prepare(WRANGLER_LEDGER_DDL).run();
    const sql = await readFile(
      new URL("../../migrations/0001_membership.sql", import.meta.url),
      "utf8",
    );
    // Wrangler appends the ledger insert to the migration text and executes it as one command.
    await db.batch([
      ...unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)),
      db.prepare(`INSERT INTO "d1_migrations" (name) values ('0001_membership.sql')`),
    ]);
    const before = await schema(db);
    await migrate(db);
    expect(await schema(db)).toEqual(before);
    expect(await ledger(db)).toEqual([{ id: 1, name: "0001_membership.sql" }]);
  }, 30_000);

  it("characterization: re-running 0001 without its ledger row fails atomically (DDL is not idempotent)", async () => {
    const db = await fresh();
    await migrate(db);
    await db.prepare("DELETE FROM d1_migrations").run();
    await db.prepare("UPDATE organization SET revision = 7 WHERE id = 'slice'").run();
    await expect(migrate(db)).rejects.toThrow(/already exists/);
    expect(await db.prepare("SELECT revision FROM organization").first("revision")).toBe(7);
    expect(await ledger(db)).toEqual([]);
  }, 30_000);
});
