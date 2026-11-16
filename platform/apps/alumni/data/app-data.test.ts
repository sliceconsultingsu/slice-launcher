// What the screens and assistant tools rely on: reads that only return what the asker may see,
// a student's own profile, the match record, and the upkeep operations the refresh uses.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InvalidChoiceError } from "./reads";
import { alumniData, type AlumniData } from "./services";
import { AlumniDataError } from "./store";
import type { StudentAnswers } from "./students";
import { count, loadSeed, openAlumniDatabase, type TestDatabase } from "../tests/database";

let fixture: Awaited<ReturnType<typeof openAlumniDatabase>>;
let db: TestDatabase;
let data: AlumniData;
const NOW = "2026-11-15T15:00:00.000Z";
const member = { memberId: "member-example-01", admin: false };
const admin = { memberId: "member-example-admin", admin: true };

beforeAll(async () => {
  fixture = await openAlumniDatabase();
  db = fixture.db;
}, 30_000);
afterAll(async () => fixture?.runtime.dispose());
beforeEach(async () => {
  await loadSeed(db);
  let next = 0;
  data = alumniData(db, { now: () => NOW, newId: () => `test-${++next}` });
});

const answers: StudentAnswers = {
  graduationYear: 2028,
  majorIds: ["finance", "economics"],
  careerGoal: "Work in strategy consulting after graduation.",
  skillIds: ["excel", "data-analysis"],
  industryIds: ["consulting", "financial-services"],
  locationIds: ["loc-nyc"],
  helpKindIds: ["case-interview-practice", "career-advice"],
  linkedinUrl: "https://www.linkedin.com/in/example-new-student",
};
const newMember = { id: "member-example-new", name: "Morgan Example" };

describe("fixed lists", () => {
  it("returns every list people choose from, without former degree names", async () => {
    const lists = await data.reads.lists();
    expect(lists.industries).toHaveLength(19);
    expect(lists.helpKinds).toHaveLength(6);
    expect(lists.skills.length).toBeGreaterThan(10);
    expect(lists.schools).toHaveLength(10);
    expect(lists.majors).toHaveLength(53);
    expect(lists.majors.find((major) => major.id === "finance")).toMatchObject({
      name: "Finance",
      schoolId: "whitman",
    });
    expect(lists.cities).toContainEqual({ id: "loc-nyc", name: "New York, NY" });
    // Only what a listed alum has is offered as a filter: nobody in the seed works in Sales.
    expect(lists.inUse.industries).toContain("consulting");
    expect(lists.inUse.industries).not.toContain("sales");
    expect(lists.inUse.schools).toContain("whitman");
    expect(lists.inUse.majors).toContain("finance");
    expect(lists.inUse.helpKinds).toContain("career-advice");
    expect(lists.inUse.industries.length).toBeLessThan(lists.industries.length);
    expect(lists.cities).toContainEqual({ id: "loc-lon", name: "London, United Kingdom" });
    // A city nobody listed works in is not offered: one added by an unreviewed proposal, say.
    await data.store.findOrCreateLocation("Reykjavik", null, "Iceland");
    expect((await data.reads.lists()).cities.map((city) => city.name)).not.toContain(
      "Reykjavik, Iceland",
    );
  });
});

describe("searching alumni", () => {
  it("never returns a hidden alum or a merged record to a member", async () => {
    const page = await data.reads.searchAlumni(member, { limit: 50 });
    const ids = page.results.map((alum) => alum.id);
    expect(page.total).toBe(28);
    expect(ids).toHaveLength(28);
    expect(ids).not.toContain("p-a18"); // hidden from listings
    expect(ids).not.toContain("p-a28"); // merged into p-a27
    expect(page.results.every((alum) => !("hidden" in alum))).toBe(true);
    expect(page.nextOffset).toBeNull();
  });

  it("ignores a member's request to include hidden alumni, and honors an admin's", async () => {
    const asMember = await data.reads.searchAlumni(member, { includeHidden: true, limit: 50 });
    expect(asMember.results.map((alum) => alum.id)).not.toContain("p-a18");
    const asAdmin = await data.reads.searchAlumni(admin, { includeHidden: true, limit: 50 });
    expect(asAdmin.total).toBe(29);
    expect(asAdmin.results.find((alum) => alum.id === "p-a18")).toMatchObject({ hidden: true });
    expect(asAdmin.results.map((alum) => alum.id)).not.toContain("p-a28");
  });

  it("filters by the industry of the current job only", async () => {
    const page = await data.reads.searchAlumni(member, { industry: "consulting" });
    expect(page.results.map((alum) => alum.id).sort()).toEqual([
      "p-a05",
      "p-a09",
      "p-a26",
      "p-a27",
    ]);
    expect(page.results.every((alum) => alum.industry === "Consulting")).toBe(true);
  });

  it("combines filters, and clearing them returns everyone again", async () => {
    const narrowed = await data.reads.searchAlumni(member, {
      industry: "consulting",
      city: "loc-nyc",
      help: "case-interview-practice",
    });
    expect(narrowed.results.map((alum) => alum.id)).toEqual(["p-a05"]);
    expect((await data.reads.searchAlumni(member, {})).total).toBe(28);
  });

  it("filters by school, major and graduation year", async () => {
    const whitman = await data.reads.searchAlumni(member, { school: "whitman", limit: 50 });
    expect(whitman.results.length).toBeGreaterThan(0);
    expect(whitman.results.every((alum) => alum.schools.some((s) => s.includes("Whitman")))).toBe(
      true,
    );
    const finance = await data.reads.searchAlumni(member, { major: "finance" });
    expect(finance.results.map((alum) => alum.id)).toContain("p-a01");
    const years = await data.reads.searchAlumni(member, { yearFrom: 2020, yearTo: 2021 });
    expect(years.results.length).toBeGreaterThan(0);
    expect(years.results.every((a) => a.graduationYear >= 2020 && a.graduationYear <= 2021)).toBe(
      true,
    );
  });

  it("searches by part of a name, an alias or an employer, ignoring case and accents", async () => {
    const byName = await data.reads.searchAlumni(member, { q: "RENEE" });
    expect(byName.results.map((alum) => alum.name)).toEqual(["Renée Dubois"]);
    const byEmployer = await data.reads.searchAlumni(member, { q: "quarry street" });
    expect(byEmployer.results.map((alum) => alum.id).sort()).toEqual(["p-a09", "p-a27"]);
    expect((await data.reads.searchAlumni(member, { q: "%" })).total).toBe(0);
  });

  it("sorts by name, graduation year and most recently checked", async () => {
    const byName = await data.reads.searchAlumni(member, { sort: "name", limit: 50 });
    const names = byName.results.map((alum) => alum.name.toLowerCase());
    expect(names[0]).toBe("aisha bello");
    const byYear = await data.reads.searchAlumni(member, { sort: "year", limit: 50 });
    const years = byYear.results.map((alum) => alum.graduationYear);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    const byChecked = await data.reads.searchAlumni(member, { sort: "checked", limit: 50 });
    const checked = byChecked.results.map((alum) => alum.lastCheckedAt);
    const dated = checked.filter((value) => value !== null);
    expect(dated).toEqual([...dated].sort().reverse());
    expect(checked.slice(dated.length).every((value) => value === null)).toBe(true);
  });

  it("returns a page at a time with a way to ask for the next", async () => {
    const first = await data.reads.searchAlumni(member, { limit: 10 });
    expect(first.results).toHaveLength(10);
    expect(first.nextOffset).toBe(10);
    const last = await data.reads.searchAlumni(member, { limit: 10, offset: 20 });
    expect(last.results).toHaveLength(8);
    expect(last.nextOffset).toBeNull();
    const seen = new Set([...first.results, ...last.results].map((alum) => alum.id));
    expect(seen.size).toBe(18);
  });

  it("refuses an unknown choice and lists the valid ones", async () => {
    const error = await data.reads.searchAlumni(member, { industry: "astrology" }).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidChoiceError);
    expect(error.field).toBe("industry");
    expect(error.valid).toContainEqual({ id: "consulting", name: "Consulting" });
    await expect(data.reads.searchAlumni(member, { limit: 500 })).rejects.toThrow(AlumniDataError);
  });

  it("counts a failed refresh check as not checked", async () => {
    // p-a24: unchanged on 20 October, unreachable on 3 November. Only the first counts.
    const page = await data.reads.searchAlumni(member, { q: "Kai Nakamura" });
    expect(page.results[0]?.lastCheckedAt).toBe("2026-10-20T08:00:00.000Z");
  });
});

describe("one alum's profile", () => {
  it("shows a member the shared contact details and never a hidden one", async () => {
    const profile = await data.reads.getAlum(member, "p-a09");
    expect(profile).toMatchObject({
      name: "Marcus Bellweather",
      title: "Senior Consultant",
      employer: "Quarry Street Consulting",
      city: "Boston, MA",
      note: "Former Slice project lead.",
    });
    expect(profile?.pastJobs).toEqual([
      expect.objectContaining({ title: "Analyst", employer: "Bluestone Advisory Group" }),
    ]);
    expect(profile?.helpOffered).toEqual([
      "Career advice",
      "Case interview practice",
      "Resume review",
    ]);
    // The email is shared; the phone number is hidden.
    expect(profile?.contacts).toEqual([
      { kind: "email", label: null, value: "marcus.b@example.com" },
    ]);
  });

  it("shows an admin hidden details, marked as hidden, with IDs to change them", async () => {
    const profile = await data.reads.getAlum(admin, "p-a09");
    expect(profile?.contacts).toContainEqual({
      id: "c-11",
      kind: "phone",
      label: null,
      value: "+1 315-555-0142",
      hidden: true,
    });
  });

  it("returns nothing to a member for a hidden alum, a merged record or an unknown ID", async () => {
    expect(await data.reads.getAlum(member, "p-a18")).toBeNull();
    expect(await data.reads.getAlum(member, "p-a28")).toBeNull();
    expect(await data.reads.getAlum(member, "nobody")).toBeNull();
    expect(await data.reads.getAlum(admin, "p-a18")).toMatchObject({ hidden: true });
    expect(await data.reads.getAlum(admin, "p-a28")).toBeNull();
  });

  it("shows the degree name held and the school of today's program", async () => {
    const profile = await data.reads.getAlum(member, "p-a13");
    expect(profile?.majors).toEqual(["Magazine, News and Digital Journalism"]);
    expect(profile?.schools[0]).toContain("Newhouse");
  });
});

describe("a student's own profile", () => {
  it("creates the profile on first save and reads back every answer", async () => {
    expect(await data.reads.getStudentProfile(newMember.id)).toBeNull();
    const saved = await data.students.saveProfile(newMember, answers);
    expect(saved).toEqual({ personId: "test-1", created: true });
    expect(await data.reads.getStudentProfile(newMember.id)).toEqual({
      personId: "test-1",
      name: "Morgan Example",
      graduationYear: 2028,
      majorIds: ["finance", "economics"],
      careerGoal: "Work in strategy consulting after graduation.",
      skillIds: ["data-analysis", "excel"],
      industryIds: ["consulting", "financial-services"],
      locationIds: ["loc-nyc"],
      helpKindIds: ["career-advice", "case-interview-practice"],
      linkedinUrl: "https://www.linkedin.com/in/example-new-student",
      complete: true,
    });
  });

  it("changes every answer on a later save without creating a second person", async () => {
    await data.students.saveProfile(newMember, answers);
    const people = await count(db, "alumni_people");
    const saved = await data.students.saveProfile(newMember, {
      graduationYear: 2029,
      majorIds: ["computer-science"],
      careerGoal: null,
      skillIds: ["python"],
      industryIds: ["technology"],
      locationIds: [],
      helpKindIds: ["resume-review"],
      linkedinUrl: null,
    });
    expect(saved).toEqual({ personId: "test-1", created: false });
    expect(await count(db, "alumni_people")).toBe(people);
    expect(await data.reads.getStudentProfile(newMember.id)).toMatchObject({
      graduationYear: 2029,
      majorIds: ["computer-science"],
      careerGoal: null,
      skillIds: ["python"],
      industryIds: ["technology"],
      locationIds: [],
      helpKindIds: ["resume-review"],
      linkedinUrl: null,
    });
  });

  it("refuses an invalid choice, lists the valid ones and saves nothing", async () => {
    const people = await count(db, "alumni_people");
    const error = await data.students
      .saveProfile(newMember, { ...answers, skillIds: ["juggling"] })
      .catch((e) => e);
    expect(error).toBeInstanceOf(InvalidChoiceError);
    expect(error.field).toBe("skill");
    expect(error.valid).toContainEqual({ id: "excel", name: "Excel and spreadsheets" });
    // A former degree name is not a choice for a current student.
    await expect(
      data.students.saveProfile(newMember, { ...answers, majorIds: ["applied-data-analytics"] }),
    ).rejects.toBeInstanceOf(InvalidChoiceError);
    await expect(
      data.students.saveProfile(newMember, { ...answers, industryIds: [] }),
    ).rejects.toThrow(AlumniDataError);
    await expect(
      data.students.saveProfile(newMember, { ...answers, linkedinUrl: "https://example.com/me" }),
    ).rejects.toThrow(/LinkedIn/);
    expect(await count(db, "alumni_people")).toBe(people);
    expect(await data.reads.getStudentProfile(newMember.id)).toBeNull();
  });

  it("gives a namesake their own record and asks an admin to decide", async () => {
    // Riley Chen, class of 2027, is already a student in the seed.
    const saved = await data.students.saveProfile(
      { id: "member-example-other", name: "Riley Chen" },
      { ...answers, graduationYear: 2027 },
    );
    expect(saved.created).toBe(true);
    const candidate = await db
      .prepare(
        "SELECT person_id, other_person_id, status FROM alumni_merge_candidates WHERE other_person_id = ?",
      )
      .bind(saved.personId)
      .first();
    expect(candidate).toEqual({
      person_id: "p-s01",
      other_person_id: saved.personId,
      status: "pending",
    });
  });

  it("reads a profile only by its own member ID", async () => {
    await data.students.saveProfile(newMember, answers);
    expect((await data.reads.getStudentProfile("member-example-01"))?.name).toBe("Riley Chen");
    expect((await data.reads.getStudentProfile(newMember.id))?.name).toBe("Morgan Example");
    expect(await data.reads.getStudentProfile("member-example-unknown")).toBeNull();
  });
});

describe("matches", () => {
  const insertMatch = (id: string, student: string, alum: string, round: number, slot: number) =>
    db
      .prepare(
        "INSERT INTO alumni_matches(id, student_id, alum_id, round, slot, matched_at, score, reasons) VALUES (?, ?, ?, ?, ?, ?, 5, ?)",
      )
      .bind(id, student, alum, round, slot, NOW, JSON.stringify(["Works in Consulting"]))
      .run();

  it("cannot record the same student and alum twice, or a match without a reason", async () => {
    await insertMatch("m-1", "p-s01", "p-a09", 1, 1);
    await expect(insertMatch("m-2", "p-s01", "p-a09", 2, 1)).rejects.toThrow(/UNIQUE/);
    await expect(insertMatch("m-3", "p-s01", "p-a05", 1, 1)).rejects.toThrow(/UNIQUE/);
    await expect(
      db
        .prepare(
          "INSERT INTO alumni_matches(id, student_id, alum_id, round, slot, matched_at, score, reasons) VALUES ('m-4', 'p-s01', 'p-a05', 1, 2, ?, 5, '[]')",
        )
        .bind(NOW)
        .run(),
    ).rejects.toThrow(/CHECK/);
  });

  it("lists a student's own matches newest first, and hides an alum who is no longer listed", async () => {
    await insertMatch("m-1", "p-s01", "p-a09", 1, 1);
    await insertMatch("m-2", "p-s01", "p-a05", 2, 1);
    await insertMatch("m-3", "p-s02", "p-a01", 1, 1);
    await db
      .prepare("UPDATE alumni_profiles SET listing_status = 'hidden' WHERE person_id = 'p-a09'")
      .run();
    const matches = await data.reads.listMatches("member-example-01");
    expect(matches.map((match) => match.id)).toEqual(["m-2", "m-1"]);
    expect(matches[0]).toMatchObject({
      round: 2,
      reasons: ["Works in Consulting"],
      outcome: null,
      alum: { id: "p-a05", name: "Chris O'Neil" },
    });
    expect(matches[1]?.alum).toBeNull();
  });

  it("lets a student record and clear the outcome of their own match only", async () => {
    await insertMatch("m-1", "p-s01", "p-a09", 1, 1);
    await data.students.recordOutcome("member-example-01", "m-1", "contacted");
    expect((await data.reads.listMatches("member-example-01"))[0]?.outcome).toBe("contacted");
    await data.students.recordOutcome("member-example-01", "m-1", null);
    expect((await data.reads.listMatches("member-example-01"))[0]?.outcome).toBeNull();
    await expect(
      data.students.recordOutcome("member-example-02", "m-1", "not-for-me"),
    ).rejects.toThrow(/No such match/);
  });
});

describe("upkeep operations", () => {
  it("finds an employer by name whatever the punctuation, and adds a new one once", async () => {
    expect(await data.store.findOrCreateEmployer("harbor & pine capital")).toBe("emp-harbor-pine");
    const employers = await count(db, "alumni_employers");
    const [first, second] = await Promise.all([
      data.store.findOrCreateEmployer("Juniper Row Partners"),
      data.store.findOrCreateEmployer("Juniper Row Partners"),
    ]);
    expect(first).toBe(second);
    expect(await count(db, "alumni_employers")).toBe(employers + 1);
    await expect(data.store.findOrCreateEmployer("   ")).rejects.toThrow(AlumniDataError);
  });

  it("finds a city ignoring case, and adds a new one once", async () => {
    expect(await data.store.findOrCreateLocation("new york", "ny", "United States")).toBe(
      "loc-nyc",
    );
    const cities = await count(db, "alumni_locations");
    const first = await data.store.findOrCreateLocation("Toronto", null, "Canada");
    expect(await data.store.findOrCreateLocation("Toronto", "", "Canada")).toBe(first);
    expect(await count(db, "alumni_locations")).toBe(cities + 1);
  });

  it("turns a student into an alum once, keeping the student record and their LinkedIn link", async () => {
    const { personId } = await data.students.saveProfile(newMember, answers);
    const profiles = await count(db, "alumni_profiles");
    expect(await data.store.graduateStudent(personId)).toBe(true);
    expect(await data.store.graduateStudent(personId)).toBe(false);
    expect(await count(db, "alumni_profiles")).toBe(profiles + 1);
    expect(
      await db
        .prepare("SELECT member_id, listing_status FROM alumni_profiles WHERE person_id = ?")
        .bind(personId)
        .first(),
    ).toEqual({ member_id: newMember.id, listing_status: "listed" });
    expect(await data.reads.getStudentProfile(newMember.id)).not.toBeNull();
    expect((await data.reads.getAlum(member, personId))?.contacts).toEqual([
      { kind: "linkedin", label: null, value: "https://www.linkedin.com/in/example-new-student" },
    ]);
    await expect(data.store.graduateStudent("nobody")).rejects.toThrow(/No such student/);
  });

  it("lets an admin hide a contact detail and show it again, with history", async () => {
    await data.store.setContactVisibility("c-10", "hidden", admin.memberId);
    expect((await data.reads.getAlum(member, "p-a09"))?.contacts).toEqual([]);
    await data.store.setContactVisibility("c-10", "members", admin.memberId);
    expect((await data.reads.getAlum(member, "p-a09"))?.contacts).toHaveLength(1);
    expect(await count(db, "alumni_change_history WHERE entity = 'contact'")).toBe(2);
    await expect(
      data.store.setContactVisibility("nothing", "hidden", admin.memberId),
    ).rejects.toThrow(/No such contact/);
  });
});
