// Rules the database itself enforces, whichever code writes to it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AlumniStore, contactKey, nameKey } from "./store";
import { count, loadSeed, openAlumniDatabase, type TestDatabase } from "./test-database";

let fixture: Awaited<ReturnType<typeof openAlumniDatabase>>;
let db: TestDatabase;
const T = "2026-11-01T12:00:00.000Z";

beforeAll(async () => {
  fixture = await openAlumniDatabase();
  db = fixture.db;
}, 30_000);
afterAll(async () => fixture?.runtime.dispose());
beforeEach(async () => loadSeed(db));

function insertPerson(id: string, name: string, year: number, extra: Record<string, unknown> = {}) {
  const columns = {
    id,
    full_name: name,
    name_key: nameKey(name),
    graduation_year: year,
    created_at: T,
    updated_at: T,
    ...extra,
  };
  const keys = Object.keys(columns);
  return db
    .prepare(
      `INSERT INTO alumni_people(${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
    )
    .bind(...Object.values(columns))
    .run();
}

describe("self-describing schema", () => {
  it("describes every alumni table and column with a comment stored in the database", async () => {
    const tables = (
      await db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name LIKE 'alumni_%'",
        )
        .all<{ name: string; sql: string }>()
    ).results;
    expect(tables).toHaveLength(22);
    for (const table of tables) {
      const lines = table.sql.split("\n");
      expect(lines[1], `${table.name} needs a description`).toMatch(/^\s*--/);
      const columns: { name: string }[] = (
        await db.prepare(`PRAGMA table_info(${table.name})`).all<{ name: string }>()
      ).results;
      for (const column of columns) {
        const line = lines.find((l: string) => l.trim().startsWith(`${column.name} `));
        expect(line, `${table.name}.${column.name} needs a comment`).toMatch(/--\s*\S/);
      }
    }
  });
});

describe("fictional seed", () => {
  it("has 30 alumni, 10 students, and name keys built by the agreed rule", async () => {
    expect(await count(db, "alumni_profiles")).toBe(30);
    expect(await count(db, "alumni_student_profiles")).toBe(10);
    const people = (
      await db
        .prepare("SELECT full_name, name_key FROM alumni_people")
        .all<{ full_name: string; name_key: string }>()
    ).results;
    for (const person of people) expect(person.name_key).toBe(nameKey(person.full_name));
    const aliases = (
      await db
        .prepare("SELECT alias, name_key FROM alumni_aliases")
        .all<{ alias: string; name_key: string }>()
    ).results;
    for (const alias of aliases) expect(alias.name_key).toBe(nameKey(alias.alias));
  });

  it("uses only reserved example addresses and fictional phone numbers", async () => {
    const contacts = (
      await db
        .prepare("SELECT kind, value, value_key FROM alumni_contacts")
        .all<{ kind: "email" | "phone" | "linkedin" | "other"; value: string; value_key: string }>()
    ).results;
    for (const contact of contacts) {
      expect(contact.value_key).toBe(contactKey(contact.kind, contact.value));
      if (contact.kind === "email") expect(contact.value).toMatch(/@example\.com$/);
      if (contact.kind === "phone") expect(contact.value).toMatch(/555-01\d\d$/);
      if (contact.kind === "linkedin") expect(contact.value).toMatch(/linkedin\.com\/in\/example-/);
      if (contact.kind === "other") expect(contact.value).toMatch(/^https:\/\/example\.com\//);
    }
  });
});

describe("duplicate prevention", () => {
  it("refuses a second active person with the same name key and graduation year", async () => {
    await expect(insertPerson("dup", "JORDAN AVERY", 2015)).rejects.toThrow(/UNIQUE/);
    await expect(insertPerson("other-year", "Jordan Avery", 2016)).resolves.toBeDefined();
  });

  it("stores a blank tie-breaker as an empty string, not NULL, so uniqueness still applies", async () => {
    await insertPerson("blank", "Quinn Example", 2020);
    const row = await db
      .prepare("SELECT disambiguator FROM alumni_people WHERE id = 'blank'")
      .first<{ disambiguator: string | null }>();
    expect(row?.disambiguator).toBe("");
    await expect(
      insertPerson("null-tie", "Quinn Example", 2021, { disambiguator: null }),
    ).rejects.toThrow(/NOT NULL/);
    await expect(
      insertPerson("blank-again", "Quinn Example", 2020, { disambiguator: "" }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("lets a true namesake in only with a different tie-breaker", async () => {
    // Seed: Taylor Morgan 2019 with '' and with 'J.'.
    await expect(
      insertPerson("tm-j", "Taylor Morgan", 2019, { disambiguator: "J." }),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      insertPerson("tm-k", "Taylor Morgan", 2019, { disambiguator: "K." }),
    ).resolves.toBeDefined();
    await expect(
      insertPerson("tm-pad", "Taylor Morgan", 2019, { disambiguator: " K." }),
    ).rejects.toThrow(/CHECK/);
  });

  it("does not count merged records, and refuses to reverse a merge that would recreate a duplicate", async () => {
    await insertPerson("old-copy", "Taylor Morgan", 2019, { merged_into: "p-a03" });
    const store = new AlumniStore(db);
    await expect(store.reverseMerge("old-copy", "member-example-admin")).rejects.toMatchObject({
      code: "conflict",
    });
    const row = await db
      .prepare("SELECT merged_into FROM alumni_people WHERE id = 'old-copy'")
      .first<{ merged_into: string }>();
    expect(row?.merged_into).toBe("p-a03");
  });

  it("refuses a record merged into itself", async () => {
    await expect(
      db.prepare("UPDATE alumni_people SET merged_into = id WHERE id = 'p-a02'").run(),
    ).rejects.toThrow(/CHECK/);
  });
});

describe("school derived from major", () => {
  it("keeps no school on the person and derives schools from majors", async () => {
    const columns = (
      await db.prepare("PRAGMA table_info(alumni_people)").all<{ name: string }>()
    ).results.map((c: { name: string }) => c.name);
    expect(columns.some((c: string) => c.includes("school"))).toBe(false);
    const schools = (
      await db
        .prepare(
          "SELECT school_id FROM alumni_person_schools WHERE person_id = 'p-a01' ORDER BY school_id",
        )
        .all<{ school_id: string }>()
    ).results;
    expect(schools.map((s: { school_id: string }) => s.school_id)).toEqual(["maxwell", "whitman"]);
  });

  it("follows a change to the major's school without touching people", async () => {
    await db
      .prepare("UPDATE alumni_majors SET school_id = 'arts-sciences' WHERE id = 'economics'")
      .run();
    const row = await db
      .prepare(
        "SELECT school_id FROM alumni_person_schools WHERE person_id = 'p-a07' AND major_id = 'economics'",
      )
      .first<{ school_id: string }>();
    expect(row?.school_id).toBe("arts-sciences");
  });

  it("assigns the Maxwell School's social science and policy majors to Maxwell", async () => {
    const maxwell = (
      await db
        .prepare(
          "SELECT id FROM alumni_majors WHERE school_id = 'maxwell' AND current_major_id IS NULL ORDER BY id",
        )
        .all<{ id: string }>()
    ).results.map((m: { id: string }) => m.id);
    expect(maxwell).toEqual([
      "anthropology",
      "economics",
      "environment-sustainability-policy",
      "geography",
      "history",
      "international-relations",
      "law-society-policy",
      "policy-studies",
      "political-science",
      "public-health",
      "sociology",
    ]);
    const hdfs = await db
      .prepare("SELECT school_id FROM alumni_majors WHERE id = 'human-development-family-science'")
      .first();
    expect(hdfs).toEqual({ school_id: "arts-sciences" });
    const ben = (
      await db
        .prepare(
          "SELECT major_id, kind, school_id FROM alumni_person_schools WHERE person_id = 'p-a20' ORDER BY major_id",
        )
        .all()
    ).results;
    expect(ben).toEqual([
      { major_id: "law-society-policy", kind: "minor", school_id: "maxwell" },
      { major_id: "political-science", kind: "major", school_id: "maxwell" },
    ]);
  });

  it("allows one primary major per person, and never a minor as primary", async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO alumni_person_majors(person_id, major_id, kind, is_primary) VALUES ('p-a01', 'history', 'major', 1)",
        )
        .run(),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      db
        .prepare(
          "INSERT INTO alumni_person_majors(person_id, major_id, kind, is_primary) VALUES ('p-a02', 'history', 'minor', 1)",
        )
        .run(),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db
        .prepare(
          "INSERT INTO alumni_person_majors(person_id, major_id) VALUES ('p-a02', 'not-a-major')",
        )
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe("contact visibility", () => {
  it("hides a new contact detail unless visibility is set", async () => {
    await db
      .prepare(
        "INSERT INTO alumni_contacts(id, person_id, kind, value, value_key, created_at, updated_at) VALUES ('c-new', 'p-a03', 'phone', '315-555-0199', '3155550199', ?, ?)",
      )
      .bind(T, T)
      .run();
    const row = await db
      .prepare("SELECT visibility, consent_at FROM alumni_contacts WHERE id = 'c-new'")
      .first();
    expect(row).toEqual({ visibility: "hidden", consent_at: null });
  });

  it("refuses to share a detail with members without a recorded consent time", async () => {
    await expect(
      db.prepare("UPDATE alumni_contacts SET visibility = 'members' WHERE id = 'c-04'").run(),
    ).rejects.toThrow(/CHECK/);
    await db
      .prepare(
        "UPDATE alumni_contacts SET visibility = 'members', consent_at = ? WHERE id = 'c-04'",
      )
      .bind(T)
      .run();
    await expect(
      db.prepare("UPDATE alumni_contacts SET visibility = 'everyone' WHERE id = 'c-04'").run(),
    ).rejects.toThrow(/CHECK/);
  });
});

describe("jobs and change records", () => {
  it("refuses a partial current job and a past job that ends before it starts", async () => {
    await expect(
      db
        .prepare("UPDATE alumni_profiles SET job_title = 'Analyst' WHERE person_id = 'p-a06'")
        .run(),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db
        .prepare(
          "INSERT INTO alumni_experiences(id, person_id, employer_id, title, industry_id, start_month, end_month, created_at) VALUES ('x', 'p-a02', 'emp-orchard', 'Intern', 'technology', '2020-06', '2019-01', ?)",
        )
        .bind(T)
        .run(),
    ).rejects.toThrow(/CHECK/);
  });

  it("only accepts proposals and history for listed fields", async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO alumni_pending_changes(id, entity, record_id, field, proposed_value, source, found_at) VALUES ('bad', 'alumni_profile', 'p-a02', 'salary', '1', 'https://example.com', ?)",
        )
        .bind(T)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(
      db
        .prepare(
          "INSERT INTO alumni_change_history(id, entity, record_id, field, actor_type, changed_at) VALUES ('bad', 'alumni_profile', 'p-a02', 'note', 'admin', ?)",
        )
        .bind(T)
        .run(),
    ).rejects.toThrow(/CHECK/);
  });
});

describe("former degree names", () => {
  const formerNames = {
    "applied-data-analytics": "applied-data-science",
    "broadcast-digital-journalism": "journalism",
    "graphic-design": "visual-communications",
    "magazine-news-digital-journalism": "journalism",
  };

  it("adds only the former names found in the catalog, retired and without a school of their own", async () => {
    const rows = (
      await db
        .prepare(
          "SELECT id, school_id, current_major_id, active FROM alumni_majors WHERE current_major_id IS NOT NULL ORDER BY id",
        )
        .all<{ id: string; school_id: string | null; current_major_id: string; active: number }>()
    ).results;
    expect(
      Object.fromEntries(
        rows.map((r: { id: string; current_major_id: string }) => [r.id, r.current_major_id]),
      ),
    ).toEqual(formerNames);
    for (const row of rows) expect(row).toMatchObject({ school_id: null, active: 0 });
  });

  it("shows the name on the degree but uses the current program and its school", async () => {
    const elena = await db
      .prepare("SELECT * FROM alumni_person_schools WHERE person_id = 'p-a13'")
      .first();
    expect(elena).toMatchObject({
      major_id: "magazine-news-digital-journalism",
      degree_name: "Magazine, News and Digital Journalism",
      current_major_id: "journalism",
      current_major_name: "Journalism",
      school_id: "newhouse",
    });
    const priya = await db
      .prepare(
        "SELECT degree_name, current_major_id, school_id FROM alumni_person_schools WHERE person_id = 'p-a10' AND major_id = 'applied-data-analytics'",
      )
      .first();
    expect(priya).toEqual({
      degree_name: "Applied Data Analytics",
      current_major_id: "applied-data-science",
      school_id: "ischool",
    });
  });

  it("follows the current program when its school changes", async () => {
    await db.prepare("UPDATE alumni_majors SET school_id = 'vpa' WHERE id = 'journalism'").run();
    const row = await db
      .prepare("SELECT school_id FROM alumni_person_schools WHERE person_id = 'p-a13'")
      .first();
    expect(row).toEqual({ school_id: "vpa" });
  });

  it("refuses former names that are active, have a school, point at themselves or at another former name", async () => {
    const insert = (id: string, school: string | null, current: string | null, active: number) =>
      db
        .prepare(
          "INSERT INTO alumni_majors(id, name, school_id, current_major_id, active) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id, `Test ${id}`, school, current, active)
        .run();
    await expect(insert("x-active", null, "journalism", 1)).rejects.toThrow(/CHECK/);
    await expect(insert("x-school", "newhouse", "journalism", 0)).rejects.toThrow(/CHECK/);
    await expect(insert("x-self", null, "x-self", 0)).rejects.toThrow(/CHECK/);
    await expect(insert("x-no-school", null, null, 1)).rejects.toThrow(/CHECK/);
    await expect(insert("x-chain", null, "graphic-design", 0)).rejects.toThrow(
      /must point to a current program/,
    );
    await expect(insert("x-ok", null, "journalism", 0)).resolves.toBeDefined();
  });

  it("refuses to retire a program that former names still point to", async () => {
    await expect(
      db
        .prepare(
          "UPDATE alumni_majors SET current_major_id = 'film', school_id = NULL, active = 0 WHERE id = 'journalism'",
        )
        .run(),
    ).rejects.toThrow(/must point to a current program/);
  });
});

describe("refresh check log", () => {
  const insert = (
    id: string,
    outcome: string,
    pending: string | null,
    detail: string | null = null,
  ) =>
    db
      .prepare(
        "INSERT INTO alumni_refresh_checks(id, person_id, source, checked_at, outcome, detail, pending_change_id) VALUES (?, 'p-a02', 'https://example.com/northgate/team', ?, ?, ?, ?)",
      )
      .bind(id, T, outcome, detail, pending)
      .run();

  it("requires a proposal for a 'proposed' check and refuses one for any other outcome", async () => {
    await expect(insert("x1", "proposed", null)).rejects.toThrow(/CHECK/);
    for (const outcome of ["unchanged", "unreachable", "error", "skipped"])
      await expect(insert(`x-${outcome}`, outcome, "pc-01")).rejects.toThrow(/CHECK/);
    await expect(insert("x2", "timeout", null)).rejects.toThrow(/CHECK/);
    await expect(insert("x3", "unreachable", null, "Timed out")).resolves.toBeDefined();
  });

  it("links a 'proposed' check only to a proposal that exists", async () => {
    await expect(insert("x4", "proposed", "no-such-proposal")).rejects.toThrow(/FOREIGN KEY/);
    const linked = await db
      .prepare(
        "SELECT c.outcome, p.field, p.status FROM alumni_refresh_checks c JOIN alumni_pending_changes p ON p.id = c.pending_change_id WHERE c.id = 'rc-01'",
      )
      .first();
    expect(linked).toEqual({ outcome: "proposed", field: "job_title", status: "pending" });
  });

  it("lets only one check link a given proposal, while any number of checks have no link", async () => {
    // Seed check rc-01 already links proposal pc-01.
    await expect(insert("x-dup", "proposed", "pc-01")).rejects.toThrow(/UNIQUE/);
    await expect(insert("x-null-1", "unreachable", null)).resolves.toBeDefined();
    await expect(insert("x-null-2", "unreachable", null)).resolves.toBeDefined();
  });

  it("keeps detail short", async () => {
    await expect(insert("x5", "error", null, "x".repeat(201))).rejects.toThrow(/CHECK/);
    await expect(insert("x6", "error", null, "   ")).rejects.toThrow(/CHECK/);
  });

  it("works out the last successful check per person and source, ignoring failures", async () => {
    // Seed: Kai Nakamura's source was unchanged on 20 October, then unreachable on 3 November.
    expect(
      await db
        .prepare("SELECT * FROM alumni_refresh_last_success WHERE person_id = 'p-a24'")
        .all()
        .then((r: { results: unknown[] }) => r.results),
    ).toEqual([
      {
        person_id: "p-a24",
        source: "https://example.com/silverline/team",
        last_success_at: "2026-10-20T08:00:00.000Z",
      },
    ]);
    // A proposed check counts as a success; error and skipped checks never appear.
    expect(
      await db
        .prepare(
          "SELECT last_success_at FROM alumni_refresh_last_success WHERE person_id = 'p-a26'",
        )
        .first(),
    ).toEqual({ last_success_at: "2026-10-05T08:00:00.000Z" });
    expect(
      await count(db, "alumni_refresh_last_success WHERE person_id IN ('p-a13', 'p-a29')"),
    ).toBe(0);
    // A newer successful check moves the date forward; profiles' dates are untouched.
    const before = await db
      .prepare(
        "SELECT last_verified_at, job_last_verified_at FROM alumni_profiles WHERE person_id = 'p-a24'",
      )
      .first();
    await db
      .prepare(
        "INSERT INTO alumni_refresh_checks(id, person_id, source, checked_at, outcome) VALUES ('x7', 'p-a24', 'https://example.com/silverline/team', '2026-11-10T08:00:00.000Z', 'unchanged')",
      )
      .run();
    expect(
      await db
        .prepare(
          "SELECT last_success_at FROM alumni_refresh_last_success WHERE person_id = 'p-a24'",
        )
        .first(),
    ).toEqual({ last_success_at: "2026-11-10T08:00:00.000Z" });
    expect(
      await db
        .prepare(
          "SELECT last_verified_at, job_last_verified_at FROM alumni_profiles WHERE person_id = 'p-a24'",
        )
        .first(),
    ).toEqual(before);
  });
});
