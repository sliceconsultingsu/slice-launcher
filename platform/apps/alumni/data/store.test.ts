// Business rules carried out by the data operations: adding alumni without duplicates, job
// changes, the pending-change review flow, and reversible merges.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AlumniDataError, AlumniStore, contactKey, nameKey } from "./store";
import { count, loadSeed, openAlumniDatabase, type TestDatabase } from "./test-database";

let fixture: Awaited<ReturnType<typeof openAlumniDatabase>>;
let db: TestDatabase;
let store: AlumniStore;
const NOW = "2026-11-13T15:00:00.000Z";
const admin = "member-example-admin";

beforeAll(async () => {
  fixture = await openAlumniDatabase();
  db = fixture.db;
}, 30_000);
afterAll(async () => fixture?.runtime.dispose());
beforeEach(async () => {
  await loadSeed(db);
  let next = 0;
  store = new AlumniStore(db, { now: () => NOW, newId: () => `test-${++next}` });
});

const profile = (personId: string) =>
  db
    .prepare("SELECT * FROM alumni_profiles WHERE person_id = ?")
    .bind(personId)
    .first<Record<string, unknown>>();
const history = (recordId: string) =>
  db
    .prepare(
      "SELECT field, old_value, new_value, actor_type, actor_member_id, pending_change_id FROM alumni_change_history WHERE record_id = ? ORDER BY changed_at, id",
    )
    .bind(recordId)
    .all<Record<string, unknown>>()
    .then((r: { results: Record<string, unknown>[] }) => r.results);

describe("name and contact keys", () => {
  it("ignores case, accents, punctuation and extra spaces", () => {
    expect(nameKey("  Renée  DUBOIS ")).toBe("renee dubois");
    expect(nameKey("Chris O'Neil")).toBe("chris oneil");
    expect(nameKey("Mei-Lin Zhao")).toBe("mei lin zhao");
    expect(nameKey("!!!")).toBe("");
  });

  it("recognizes the same email or LinkedIn profile written differently", () => {
    expect(contactKey("email", " Pat.Kim@Example.com ")).toBe("pat.kim@example.com");
    expect(contactKey("linkedin", "http://linkedin.com/in/example-x/?trk=1")).toBe(
      contactKey("linkedin", "https://www.linkedin.com/in/example-x"),
    );
    expect(contactKey("phone", "(315) 555-0142")).toBe("3155550142");
  });
});

describe("adding alumni without duplicates", () => {
  it("creates a new person with an alumni profile and hidden contact details", async () => {
    const result = await store.addAlumnus({
      fullName: "Quinn Example",
      graduationYear: 2021,
      contacts: [
        { kind: "email", value: "quinn@example.com" },
        { kind: "linkedin", value: "linkedin.com/in/example-quinn" },
      ],
    });
    expect(result).toEqual({ outcome: "created", personId: "test-1" });
    const person = await db
      .prepare("SELECT name_key, disambiguator FROM alumni_people WHERE id = 'test-1'")
      .first();
    expect(person).toEqual({ name_key: "quinn example", disambiguator: "" });
    expect(await profile("test-1")).toMatchObject({
      listing_status: "listed",
      job_employer_id: null,
    });
    const visibility = (
      await db
        .prepare("SELECT visibility FROM alumni_contacts WHERE person_id = 'test-1'")
        .all<{ visibility: string }>()
    ).results;
    expect(visibility.map((v: { visibility: string }) => v.visibility)).toEqual([
      "hidden",
      "hidden",
    ]);
  });

  it("attaches an exact match (same name key, year and email) to the existing person", async () => {
    const people = await count(db, "alumni_people");
    const result = await store.addAlumnus({
      fullName: "JORDÁN avery",
      graduationYear: 2015,
      contacts: [
        { kind: "email", value: "Jordan.Avery15@example.com" },
        { kind: "phone", value: "315-555-0111" },
      ],
    });
    expect(result).toEqual({ outcome: "attached", personId: "p-a01" });
    expect(await count(db, "alumni_people")).toBe(people);
    const phone = await db
      .prepare(
        "SELECT visibility FROM alumni_contacts WHERE person_id = 'p-a01' AND kind = 'phone'",
      )
      .first();
    expect(phone).toEqual({ visibility: "hidden" });
    expect(await history("p-a01")).toEqual([
      expect.objectContaining({ field: "contact_added", actor_type: "system" }),
    ]);
  });

  it("matches on LinkedIn too", async () => {
    const result = await store.addAlumnus({
      fullName: "Samantha Rivera-Lopez",
      graduationYear: 2014,
      contacts: [{ kind: "linkedin", value: "https://linkedin.com/in/example-sam-rivera-lopez/" }],
    });
    expect(result).toEqual({ outcome: "attached", personId: "p-a07" });
    expect(await count(db, "alumni_contacts WHERE person_id = 'p-a07'")).toBe(1);
  });

  it("sends a same-name, same-year record with a conflicting email to admin review and saves nothing to profiles", async () => {
    const people = await count(db, "alumni_people");
    const contacts = await count(db, "alumni_contacts");
    const result = await store.addAlumnus({
      fullName: "Jordan Avery",
      graduationYear: 2015,
      contacts: [{ kind: "email", value: "someone.else@example.com" }],
    });
    expect(result).toMatchObject({ outcome: "needs-review", personId: "p-a01" });
    expect(await count(db, "alumni_people")).toBe(people);
    expect(await count(db, "alumni_contacts")).toBe(contacts);
    const candidate = await db
      .prepare(
        "SELECT person_id, other_person_id, incoming_record, reason, status FROM alumni_merge_candidates WHERE id = ?",
      )
      .bind(result.outcome === "needs-review" ? result.candidateId : "")
      .first<Record<string, string | null>>();
    expect(candidate).toMatchObject({
      person_id: "p-a01",
      other_person_id: null,
      status: "pending",
    });
    expect(candidate?.reason).toMatch(/differs/);
    expect(JSON.parse(String(candidate?.incoming_record))).toMatchObject({
      fullName: "Jordan Avery",
      contacts: [{ value: "someone.else@example.com" }],
    });
  });

  it("sends review when one email matches but the LinkedIn conflicts", async () => {
    const result = await store.addAlumnus({
      fullName: "Jordan Avery",
      graduationYear: 2015,
      contacts: [
        { kind: "email", value: "jordan.avery15@example.com" },
        { kind: "linkedin", value: "linkedin.com/in/example-different" },
      ],
    });
    expect(result.outcome).toBe("needs-review");
  });

  it("sends review when nothing confirms the match", async () => {
    const result = await store.addAlumnus({ fullName: "Jordan Avery", graduationYear: 2018 });
    expect(result).toMatchObject({ outcome: "needs-review", personId: "p-a02" });
    expect(
      (
        await db
          .prepare("SELECT reason FROM alumni_merge_candidates WHERE person_id = 'p-a02'")
          .first<{ reason: string }>()
      )?.reason,
    ).toMatch(/no shared email/);
  });

  it("uses the tie-breaker: a namesake with a new tie-breaker is a new person", async () => {
    expect(
      await store.addAlumnus({
        fullName: "Taylor Morgan",
        graduationYear: 2019,
        disambiguator: "J.",
        contacts: [{ kind: "email", value: "tj.morgan@example.com" }],
      }),
    ).toEqual({ outcome: "attached", personId: "p-a04" });
    expect(
      await store.addAlumnus({
        fullName: "Taylor Morgan",
        graduationYear: 2019,
        disambiguator: " K. ",
      }),
    ).toEqual({ outcome: "created", personId: "test-1" });
    const row = await db
      .prepare("SELECT disambiguator FROM alumni_people WHERE id = 'test-1'")
      .first();
    expect(row).toEqual({ disambiguator: "K." });
  });

  it("rejects invalid records", async () => {
    await expect(store.addAlumnus({ fullName: "", graduationYear: 2015 })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(
      store.addAlumnus({ fullName: "Ann Example", graduationYear: 2015.5 }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(store.addAlumnus({ fullName: "...", graduationYear: 2015 })).rejects.toMatchObject(
      { code: "invalid" },
    );
  });
});

describe("changing jobs", () => {
  it("moves the current job to past jobs, so it is never in both places", async () => {
    await store.changeJob(
      "p-a26",
      {
        employerId: "emp-quarry",
        title: "Manager",
        industryId: "consulting",
        locationId: "loc-chi",
        startMonth: "2026-11",
      },
      { type: "alumnus", memberId: "member-example-30" },
      "2026-10",
    );
    expect(await profile("p-a26")).toMatchObject({
      job_employer_id: "emp-quarry",
      job_title: "Manager",
      job_start_month: "2026-11",
      job_last_verified_at: NOW,
    });
    const past = await db
      .prepare(
        "SELECT employer_id, title, start_month, end_month FROM alumni_experiences WHERE person_id = 'p-a26'",
      )
      .all();
    expect(past.results).toEqual([
      {
        employer_id: "emp-bluestone",
        title: "Consultant",
        start_month: "2018-07",
        end_month: "2026-10",
      },
    ]);
    expect(
      await count(
        db,
        "alumni_experiences e JOIN alumni_profiles p ON p.person_id = e.person_id WHERE e.employer_id = p.job_employer_id AND e.title = p.job_title",
      ),
    ).toBe(0);
    const [entry] = await history("p-a26");
    expect(entry).toMatchObject({
      field: "current_job",
      actor_type: "alumnus",
      actor_member_id: "member-example-30",
    });
    expect(JSON.parse(String(entry.old_value))).toMatchObject({
      employerId: "emp-bluestone",
      title: "Consultant",
    });
  });

  it("adds no past job when there was no current job", async () => {
    await store.changeJob(
      "p-a23",
      { employerId: "emp-maplecrest", title: "Founder", industryId: "consumer-retail" },
      { type: "admin", memberId: admin },
    );
    expect(await count(db, "alumni_experiences WHERE person_id = 'p-a23'")).toBe(1);
    expect((await history("p-a23"))[0]).toMatchObject({ old_value: null });
  });

  it("rejects invalid jobs and unknown people", async () => {
    await expect(
      store.changeJob(
        "p-a26",
        { employerId: "emp-quarry", title: "", industryId: "consulting" },
        { type: "system" },
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.changeJob(
        "p-a26",
        { employerId: "emp-quarry", title: "X", industryId: "consulting" },
        { type: "system" },
        "2026-13",
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.changeJob(
        "nobody",
        { employerId: "emp-quarry", title: "X", industryId: "consulting" },
        { type: "system" },
      ),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      store.changeJob(
        "p-a26",
        { employerId: "emp-quarry", title: "X", industryId: "consulting" },
        { type: "admin" },
      ),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("edits by an alumnus or admin", () => {
  it("apply immediately and are logged", async () => {
    await store.editField(
      { entity: "alumni_profile", recordId: "p-a18", field: "listing_status" },
      "listed",
      { type: "admin", memberId: admin },
    );
    expect(await profile("p-a18")).toMatchObject({ listing_status: "listed", updated_at: NOW });
    expect(await history("p-a18")).toEqual([
      {
        field: "listing_status",
        old_value: "hidden",
        new_value: "listed",
        actor_type: "admin",
        actor_member_id: admin,
        pending_change_id: null,
      },
    ]);
    await store.editField(
      { entity: "student_profile", recordId: "p-s02", field: "note" },
      "Looking for PR internships.",
      { type: "student", memberId: "member-example-02" },
    );
    expect((await history("p-s02"))[0]).toMatchObject({
      actor_type: "student",
      new_value: "Looking for PR internships.",
    });
  });

  it("refuse unknown fields and invalid values", async () => {
    await expect(
      store.editField({ entity: "alumni_profile", recordId: "p-a18", field: "member_id" }, "x", {
        type: "admin",
        memberId: admin,
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.editField(
        { entity: "alumni_profile", recordId: "p-a18", field: "listing_status" },
        "public",
        { type: "admin", memberId: admin },
      ),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("pending changes from the refresh runner", () => {
  const proposal = {
    entity: "alumni_profile" as const,
    recordId: "p-a24",
    field: "job_title",
    proposedValue: "Senior Software Engineer",
    source: "https://example.com/silverline/team",
    foundAt: "2026-11-12T08:00:00.000Z",
  };

  it("never change the profile until approved", async () => {
    const id = await store.proposeChange(proposal);
    expect(await profile("p-a24")).toMatchObject({ job_title: "Software Engineer II" });
    expect(await history("p-a24")).toEqual([]);
    const row = await db
      .prepare(
        "SELECT current_value, proposed_value, status FROM alumni_pending_changes WHERE id = ?",
      )
      .bind(id)
      .first();
    expect(row).toEqual({
      current_value: "Software Engineer II",
      proposed_value: "Senior Software Engineer",
      status: "pending",
    });
  });

  it("apply on approval, with history linked to the proposal and reviewer", async () => {
    const id = await store.proposeChange(proposal);
    await store.reviewChange(id, "approved", admin);
    expect(await profile("p-a24")).toMatchObject({ job_title: "Senior Software Engineer" });
    expect(
      await db
        .prepare("SELECT status, reviewed_by, reviewed_at FROM alumni_pending_changes WHERE id = ?")
        .bind(id)
        .first(),
    ).toEqual({ status: "approved", reviewed_by: admin, reviewed_at: NOW });
    expect(await history("p-a24")).toEqual([
      {
        field: "job_title",
        old_value: "Software Engineer II",
        new_value: "Senior Software Engineer",
        actor_type: "runner",
        actor_member_id: null,
        pending_change_id: id,
      },
    ]);
    await expect(store.reviewChange(id, "approved", admin)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("leave the profile alone when rejected", async () => {
    await store.reviewChange("pc-01", "rejected", admin);
    expect(await profile("p-a26")).toMatchObject({ job_title: "Consultant" });
    expect(await history("p-a26")).toEqual([]);
    expect(
      await db.prepare("SELECT status FROM alumni_pending_changes WHERE id = 'pc-01'").first(),
    ).toEqual({ status: "rejected" });
    await expect(store.reviewChange("pc-01", "rejected", admin)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(store.reviewChange("missing", "rejected", admin)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("refuse approval when the field changed after the proposal, keeping the newer edit", async () => {
    await store.editField(
      { entity: "alumni_profile", recordId: "p-a26", field: "job_title" },
      "Lead Consultant",
      { type: "alumnus", memberId: "member-example-30" },
    );
    await expect(store.reviewChange("pc-01", "approved", admin)).rejects.toMatchObject({
      code: "stale",
    });
    expect(await profile("p-a26")).toMatchObject({ job_title: "Lead Consultant" });
    expect(
      await db.prepare("SELECT status FROM alumni_pending_changes WHERE id = 'pc-01'").first(),
    ).toEqual({ status: "pending" });
    // Only the alumnus's own edit is logged; the refused approval leaves no history.
    expect(await history("p-a26")).toEqual([
      expect.objectContaining({
        field: "job_title",
        actor_type: "alumnus",
        pending_change_id: null,
      }),
    ]);
  });

  it("can propose a whole new job, which moves the old one to past jobs on approval", async () => {
    const id = await store.proposeChange({
      ...proposal,
      recordId: "p-a10",
      field: "current_job",
      proposedValue: {
        employerId: "emp-silverline",
        title: "Data Scientist",
        industryId: "technology",
        locationId: "loc-sf",
        startMonth: "2026-09",
      },
    });
    expect(await count(db, "alumni_experiences WHERE person_id = 'p-a10'")).toBe(0);
    await store.reviewChange(id, "approved", admin);
    expect(await profile("p-a10")).toMatchObject({
      job_employer_id: "emp-silverline",
      job_title: "Data Scientist",
    });
    expect(
      await db
        .prepare("SELECT employer_id, end_month FROM alumni_experiences WHERE person_id = 'p-a10'")
        .first(),
    ).toEqual({ employer_id: "emp-orchard", end_month: "2026-11" });
  });

  it("refuse proposals for unknown fields, records or values", async () => {
    await expect(store.proposeChange({ ...proposal, field: "full_name" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(store.proposeChange({ ...proposal, recordId: "nobody" })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(
      store.proposeChange({ ...proposal, field: "listing_status", proposedValue: "everyone" }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.proposeChange({
        ...proposal,
        field: "current_job",
        proposedValue: { employerId: "emp-x" } as never,
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("protection against a change made at the same moment", () => {
  it("rolls back the whole update if the record changed between reading and writing", async () => {
    // Simulates someone else editing the title just before our write reaches the database.
    const racing = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        await db
          .prepare(
            "UPDATE alumni_profiles SET job_title = 'Changed elsewhere' WHERE person_id = 'p-a26'",
          )
          .run();
        return db.batch(statements);
      },
    } as unknown as Pick<D1Database, "prepare" | "batch">;
    const racingStore = new AlumniStore(racing, { now: () => NOW });
    await expect(
      racingStore.changeJob(
        "p-a26",
        { employerId: "emp-quarry", title: "Manager", industryId: "consulting" },
        { type: "system" },
      ),
    ).rejects.toMatchObject({ code: "stale" });
    expect(await profile("p-a26")).toMatchObject({
      job_title: "Changed elsewhere",
      job_employer_id: "emp-bluestone",
    });
    expect(await count(db, "alumni_experiences WHERE person_id = 'p-a26'")).toBe(0);
    expect(await history("p-a26")).toEqual([]);
  });

  it("applies a proposal only once if another admin reviews it at the same moment", async () => {
    // Simulates a second admin rejecting the proposal just before this approval is written.
    const racing = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        await db
          .prepare(
            "UPDATE alumni_pending_changes SET status = 'rejected', reviewed_by = 'member-example-other', reviewed_at = ? WHERE id = 'pc-01'",
          )
          .bind(NOW)
          .run();
        return db.batch(statements);
      },
    } as unknown as Pick<D1Database, "prepare" | "batch">;
    const racingStore = new AlumniStore(racing, { now: () => NOW });
    await expect(racingStore.reviewChange("pc-01", "approved", admin)).rejects.toMatchObject({
      code: "stale",
    });
    expect(await profile("p-a26")).toMatchObject({ job_title: "Consultant" });
    expect(
      await db
        .prepare("SELECT status, reviewed_by FROM alumni_pending_changes WHERE id = 'pc-01'")
        .first(),
    ).toEqual({ status: "rejected", reviewed_by: "member-example-other" });
    expect(await history("p-a26")).toEqual([]);
  });
});

describe("merging duplicates", () => {
  it("keeps the duplicate, points it at the kept record, closes the candidate and logs it", async () => {
    await store.mergePeople("p-a06", "p-a05", admin, "mc-01");
    expect(
      await db.prepare("SELECT merged_into FROM alumni_people WHERE id = 'p-a06'").first(),
    ).toEqual({ merged_into: "p-a05" });
    expect(await count(db, "alumni_contacts WHERE person_id = 'p-a06'")).toBe(1);
    expect(
      await db
        .prepare("SELECT status, reviewed_by FROM alumni_merge_candidates WHERE id = 'mc-01'")
        .first(),
    ).toEqual({ status: "merged", reviewed_by: admin });
    expect(await history("p-a06")).toEqual([
      {
        field: "merged_into",
        old_value: null,
        new_value: "p-a05",
        actor_type: "admin",
        actor_member_id: admin,
        pending_change_id: null,
      },
    ]);
  });

  it("can be reversed, with history", async () => {
    await store.mergePeople("p-a06", "p-a05", admin);
    await store.reverseMerge("p-a06", admin);
    expect(
      await db.prepare("SELECT merged_into FROM alumni_people WHERE id = 'p-a06'").first(),
    ).toEqual({ merged_into: null });
    expect(
      (await history("p-a06")).map((h: Record<string, unknown>) => [h.old_value, h.new_value]),
    ).toEqual([
      [null, "p-a05"],
      ["p-a05", null],
    ]);
    await store.reverseMerge("p-a28", admin);
    expect(
      await db.prepare("SELECT merged_into FROM alumni_people WHERE id = 'p-a28'").first(),
    ).toEqual({ merged_into: null });
  });

  it("refuses unsafe merges", async () => {
    await expect(store.mergePeople("p-a05", "p-a05", admin)).rejects.toBeInstanceOf(
      AlumniDataError,
    );
    await expect(store.mergePeople("p-a28", "p-a05", admin)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(store.mergePeople("p-a05", "p-a28", admin)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(store.mergePeople("p-a27", "p-a05", admin)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(store.mergePeople("p-a05", "nobody", admin)).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(store.reverseMerge("p-a05", admin)).rejects.toMatchObject({ code: "conflict" });
    await expect(store.reverseMerge("nobody", admin)).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("recording refresh checks", () => {
  const check = {
    personId: "p-a24",
    source: "https://example.com/silverline/team",
    checkedAt: "2026-11-12T08:00:00.000Z",
  };

  it("logs a failed check without touching the profile", async () => {
    const before = await profile("p-a24");
    const id = await store.recordRefreshCheck({
      ...check,
      outcome: "unreachable",
      detail: "Timed out",
    });
    expect(
      await db
        .prepare(
          "SELECT outcome, detail, pending_change_id FROM alumni_refresh_checks WHERE id = ?",
        )
        .bind(id)
        .first(),
    ).toEqual({ outcome: "unreachable", detail: "Timed out", pending_change_id: null });
    expect(await profile("p-a24")).toEqual(before);
    expect(await history("p-a24")).toEqual([]);
  });

  it("links a proposed check to the proposal it filed", async () => {
    const pendingId = await store.proposeChange({
      entity: "alumni_profile",
      recordId: "p-a24",
      field: "job_title",
      proposedValue: "Senior Software Engineer",
      source: check.source,
      foundAt: check.checkedAt,
    });
    const id = await store.recordRefreshCheck({
      ...check,
      outcome: "proposed",
      pendingChangeId: pendingId,
    });
    expect(
      await db
        .prepare("SELECT pending_change_id FROM alumni_refresh_checks WHERE id = ?")
        .bind(id)
        .first(),
    ).toEqual({ pending_change_id: pendingId });
    await expect(
      store.recordRefreshCheck({ ...check, outcome: "proposed", pendingChangeId: pendingId }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses mismatched outcomes, proposals and invalid input", async () => {
    await expect(store.recordRefreshCheck({ ...check, outcome: "proposed" })).rejects.toMatchObject(
      { code: "invalid" },
    );
    await expect(
      store.recordRefreshCheck({ ...check, outcome: "unchanged", pendingChangeId: "pc-01" }),
    ).rejects.toMatchObject({ code: "invalid" });
    // pc-01 is a proposal for p-a26, not p-a24.
    await expect(
      store.recordRefreshCheck({ ...check, outcome: "proposed", pendingChangeId: "pc-01" }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.recordRefreshCheck({ ...check, outcome: "proposed", pendingChangeId: "missing" }),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      store.recordRefreshCheck({ ...check, outcome: "timeout" as never }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.recordRefreshCheck({ ...check, outcome: "error", detail: "x".repeat(201) }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.recordRefreshCheck({ ...check, checkedAt: "yesterday", outcome: "error" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});
