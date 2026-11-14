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
    expect(tables).toHaveLength(21);
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
    expect(schools.map((s: { school_id: string }) => s.school_id)).toEqual([
      "arts-sciences",
      "whitman",
    ]);
  });

  it("follows a change to the major's school without touching people", async () => {
    await db.prepare("UPDATE alumni_majors SET school_id = 'maxwell' WHERE id = 'economics'").run();
    const row = await db
      .prepare(
        "SELECT school_id FROM alumni_person_schools WHERE person_id = 'p-a07' AND major_id = 'economics'",
      )
      .first<{ school_id: string }>();
    expect(row?.school_id).toBe("maxwell");
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
