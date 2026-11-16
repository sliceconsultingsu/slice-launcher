// Test-only helper: a disposable local D1 database with every migration applied and the fictional
// seed loaded. Never used by app code, and never connected to production.
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { unstable_splitSqlQuery } from "wrangler";
import { database, migrate } from "../../../tests/database";
import { alumniData, type AlumniData } from "../data/services";

export type TestDatabase = Awaited<ReturnType<typeof database>>["db"];

// Rows the seed adds, cleared children-first so links between tables stay valid.
const SEEDED_TABLES = [
  "alumni_matches",
  "alumni_student_skills",
  "alumni_student_answers",
  "alumni_change_history",
  "alumni_refresh_checks",
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
  // Reference lists, which some tests change; they are reloaded from migration 0005 below.
  "alumni_majors",
  "alumni_schools",
  "alumni_industries",
  "alumni_help_kinds",
];

export async function openAlumniDatabase() {
  const fixture = await database();
  await migrate(fixture.db);
  return fixture;
}

/**
 * Restores the database to exactly the reference lists plus the fictional seed, so each test
 * starts from the same data even if an earlier test changed a school or major.
 */
export async function loadSeed(db: TestDatabase) {
  const lists = await readFile(
    new URL("../../../migrations/0005_alumni_reference_lists.sql", import.meta.url),
    "utf8",
  );
  const seed = await readFile(new URL("../data/seed.sql", import.meta.url), "utf8");
  await db.batch([
    // One DELETE per table: links between rows of the same table are checked when it finishes.
    ...SEEDED_TABLES.map((table) => db.prepare(`DELETE FROM ${table}`)),
    ...unstable_splitSqlQuery(lists).map((statement) => db.prepare(statement)),
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

/**
 * Sets up one disposable database for a test file, reloads the seed before each test, and gives
 * the test a clock it can move. IDs are predictable: test-1, test-2, and so on.
 */
export function useAlumniData(start = "2026-11-15T15:00:00.000Z") {
  let fixture: Awaited<ReturnType<typeof openAlumniDatabase>> | undefined;
  let data: AlumniData | undefined;
  const ready = <Value>(value: Value | undefined): Value => {
    if (value === undefined) throw new Error("The test database is not ready yet.");
    return value;
  };
  const state = {
    /** The current time every operation sees. Assign to move the clock. */
    now: start,
    get db(): TestDatabase {
      return ready(fixture).db;
    },
    get data(): AlumniData {
      return ready(data);
    },
    /** Moves the clock forward. */
    advance(seconds: number) {
      state.now = new Date(Date.parse(state.now) + seconds * 1000).toISOString();
    },
  };
  beforeAll(async () => {
    fixture = await openAlumniDatabase();
  }, 30_000);
  afterAll(async () => fixture?.runtime.dispose());
  beforeEach(async () => {
    await loadSeed(state.db);
    state.now = start;
    let next = 0;
    data = alumniData(state.db, { now: () => state.now, newId: () => `test-${++next}` });
  });
  return state;
}
