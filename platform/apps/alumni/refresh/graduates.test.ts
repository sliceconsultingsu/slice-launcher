import { describe, expect, it } from "vitest";
import { count, useAlumniData } from "../tests/database";
import { refreshGraduates } from "./graduates";

const t = useAlumniData();
const studentsUpTo = async (year: number) =>
  (
    await t.db
      .prepare(
        `SELECT p.id FROM alumni_people p JOIN alumni_student_profiles sp ON sp.person_id = p.id
         WHERE p.graduation_year <= ? AND p.merged_into IS NULL
           AND NOT EXISTS (SELECT 1 FROM alumni_profiles ap WHERE ap.person_id = p.id)
         ORDER BY p.graduation_year, p.id`,
      )
      .bind(year)
      .all<{ id: string }>()
  ).results.map((row: { id: string }) => row.id);

describe("refresh_graduates", () => {
  it("graduates nobody the day before the cutoff and the whole class on the day", async () => {
    const before = await studentsUpTo(2026);
    const class2027 = (await studentsUpTo(2027)).filter((id: string) => !before.includes(id));
    expect(class2027).toContain("p-s01");
    t.now = "2027-05-31T23:59:59.000Z";
    const early = await refreshGraduates(t.data);
    expect(early.graduated.map((person) => person.personId)).toEqual(before);
    t.now = "2027-06-01T00:00:00.000Z";
    const onTheDay = await refreshGraduates(t.data);
    expect(onTheDay.graduated.map((person) => person.personId)).toEqual(class2027);
    expect(onTheDay.graduated).toContainEqual({ personId: "p-s01", fullName: "Riley Chen" });
  });

  it("adds nobody twice, keeps the student record and lists the new alum", async () => {
    t.now = "2027-06-01T12:00:00.000Z";
    const profiles = await count(t.db, "alumni_profiles");
    const students = await count(t.db, "alumni_student_profiles");
    const first = await refreshGraduates(t.data);
    expect(first.graduated.length).toBeGreaterThan(0);
    expect(await refreshGraduates(t.data)).toEqual({ graduated: [] });
    expect(await count(t.db, "alumni_profiles")).toBe(profiles + first.graduated.length);
    expect(await count(t.db, "alumni_student_profiles")).toBe(students);
    expect(
      await t.db
        .prepare("SELECT member_id, listing_status FROM alumni_profiles WHERE person_id = 'p-s01'")
        .first(),
    ).toEqual({ member_id: "member-example-01", listing_status: "listed" });
    const alum = await t.data.reads.getAlum({ memberId: "anyone", admin: false }, "p-s01");
    expect(alum).toMatchObject({ name: "Riley Chen", graduationYear: 2027, title: null });
  });

  it("leaves out a student whose record was merged into another", async () => {
    await t.db.prepare("UPDATE alumni_people SET merged_into = 'p-s03' WHERE id = 'p-s01'").run();
    t.now = "2027-06-01T12:00:00.000Z";
    const result = await refreshGraduates(t.data);
    expect(result.graduated.map((person) => person.personId)).not.toContain("p-s01");
  });
});
