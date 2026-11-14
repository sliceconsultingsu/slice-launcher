// Test-only helper: a disposable local D1 database with every migration applied and the fictional
// seed loaded. Never used by app code, and never connected to production.
import { readFile } from "node:fs/promises";
import { unstable_splitSqlQuery } from "wrangler";
import { database, migrate } from "../../../tests/database";

export type TestDatabase = Awaited<ReturnType<typeof database>>["db"];

// Rows the seed adds, cleared children-first so links between tables stay valid.
const SEEDED_TABLES = [
  "alumni_change_history",
  "alumni_pending_changes",
  "alumni_merge_candidates",
  "alumni_help_sought",
  "alumni_student_cities",
  "alumni_student_industries",
  "alumni_student_profiles",
  "alumni_help_offered",
  "alumni_contacts",
  "alumni_experiences",
  "alumni_profiles",
  "alumni_person_majors",
  "alumni_aliases",
  "alumni_people",
  "alumni_employers",
  "alumni_locations",
];

export async function openAlumniDatabase() {
  const fixture = await database();
  await migrate(fixture.db);
  return fixture;
}

/** Restores the database to exactly the fictional seed, so each test starts from the same data. */
export async function loadSeed(db: TestDatabase) {
  const seed = await readFile(new URL("./seed.sql", import.meta.url), "utf8");
  await db.batch([
    // One DELETE per table: links between rows of the same table are checked when it finishes.
    ...SEEDED_TABLES.map((table) => db.prepare(`DELETE FROM ${table}`)),
    ...unstable_splitSqlQuery(seed).map((statement) => db.prepare(statement)),
  ]);
}

export async function count(db: TestDatabase, sql: string, ...params: unknown[]) {
  const row = await db
    .prepare(`SELECT count(*) AS n FROM ${sql}`)
    .bind(...params)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
