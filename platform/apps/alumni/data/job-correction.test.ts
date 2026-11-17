// Correcting a mistake in an alum's current job: the record is fixed in place, nothing about it
// pretends the alum changed jobs, and only an admin may do it.
import { describe, expect, it } from "vitest";
import { alumniApi } from "../api";
import { count, useAlumniData } from "../tests/database";
import { apiAs } from "../tests/members";
import { correctJob } from "./job-correction";
import { recentActivity } from "./network";
import { AlumniStore } from "./store";

const t = useAlumniData();
const api = apiAs((props) => alumniApi(props, () => t.data));
const ADMIN = "member-example-admin";
const profile = (personId: string) =>
  t.db
    .prepare(
      `SELECT e.name AS employer, pr.job_title, pr.job_industry_id, pr.job_location_id, pr.job_start_month,
         pr.job_last_verified_at, pr.last_verified_at
       FROM alumni_profiles pr LEFT JOIN alumni_employers e ON e.id = pr.job_employer_id
       WHERE pr.person_id = ?`,
    )
    .bind(personId)
    .first<Record<string, unknown>>();
const history = (personId: string) =>
  t.db
    .prepare(
      "SELECT field, old_value, new_value, actor_type, actor_member_id FROM alumni_change_history WHERE record_id = ? ORDER BY changed_at, id",
    )
    .bind(personId)
    .all<Record<string, string | null>>()
    .then((result: { results: Record<string, string | null>[] }) => result.results);

// p-a01 is a listed Associate at Harbor & Pine Capital in financial services, checked 15 Sep 2026.
// "Harbor Pine Capital" below is the same company, typed without the ampersand.
const fixed = {
  employer: "Harbor Pine Capital",
  title: "Senior Associate",
  industryId: "consulting",
};

describe("correcting a current job", () => {
  it("fixes the company, role and industry without moving the job to past jobs", async () => {
    const before = await profile("p-a01");
    const pastJobs = () => count(t.db, "alumni_experiences WHERE person_id = 'p-a01'");
    const pastBefore = await pastJobs();
    expect(await correctJob(t.data, ADMIN, "p-a01", fixed)).toBe("corrected");
    expect(await profile("p-a01")).toEqual({
      ...before,
      job_title: "Senior Associate",
      job_industry_id: "consulting",
    });
    expect(await pastJobs()).toBe(pastBefore);
  });

  it("keeps the start month, city and the dates the details were last checked", async () => {
    const before = await profile("p-a01");
    await correctJob(t.data, ADMIN, "p-a01", { ...fixed, employer: "Northgate Partners" });
    expect(await profile("p-a01")).toMatchObject({
      job_location_id: before?.job_location_id,
      job_start_month: before?.job_start_month,
      job_last_verified_at: before?.job_last_verified_at,
      last_verified_at: before?.last_verified_at,
    });
  });

  it("logs a correction with the job before and after, made by the admin", async () => {
    await correctJob(t.data, ADMIN, "p-a01", fixed);
    const entries = await history("p-a01");
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({
      field: "job_corrected",
      actor_type: "admin",
      actor_member_id: ADMIN,
    });
    expect(JSON.parse(entry?.old_value ?? "")).toMatchObject({
      title: "Associate",
      industryId: "financial-services",
    });
    expect(JSON.parse(entry?.new_value ?? "")).toMatchObject({
      title: "Senior Associate",
      industryId: "consulting",
    });
  });

  it("is not shown as a job change in what changed lately", async () => {
    await correctJob(t.data, ADMIN, "p-a01", fixed);
    const items = await recentActivity(t.db, t.now);
    expect(items.some((item) => item.kind === "job" && item.alum.id === "p-a01")).toBe(false);
  });

  it("uses an employer already in the app when the name matches, and adds one otherwise", async () => {
    const employers = () => count(t.db, "alumni_employers");
    const start = await employers();
    await correctJob(t.data, ADMIN, "p-a01", { ...fixed, employer: "  bluestone advisory GROUP " });
    expect(await profile("p-a01")).toMatchObject({ employer: "Bluestone Advisory Group" });
    expect(await employers()).toBe(start);
    await correctJob(t.data, ADMIN, "p-a01", { ...fixed, employer: "Invented Example Ltd" });
    expect(await profile("p-a01")).toMatchObject({ employer: "Invented Example Ltd" });
    expect(await employers()).toBe(start + 1);
  });

  it("changes nothing and logs nothing when the details are already right", async () => {
    const result = await correctJob(t.data, ADMIN, "p-a01", {
      employer: "harbor pine capital",
      title: "Associate",
      industryId: "financial-services",
    });
    expect(result).toBe("unchanged");
    expect(await history("p-a01")).toEqual([]);
  });

  it("refuses an alum with no current job, so a new job is recorded as one", async () => {
    await expect(correctJob(t.data, ADMIN, "p-a23", fixed)).rejects.toMatchObject({
      code: "invalid",
      message: expect.stringContaining("no current job"),
    });
  });

  it("refuses an industry that is not on the list, and says which ones are", async () => {
    await expect(
      correctJob(t.data, ADMIN, "p-a01", { ...fixed, industryId: "astrology" }),
    ).rejects.toMatchObject({
      field: "industry",
      valid: expect.arrayContaining([{ id: "consulting", name: "Consulting" }]),
    });
    expect(await history("p-a01")).toEqual([]);
  });

  it("refuses blank details, unknown people and records merged into another", async () => {
    await expect(
      correctJob(t.data, ADMIN, "p-a01", { ...fixed, title: "  " }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(correctJob(t.data, ADMIN, "nobody", fixed)).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(correctJob(t.data, ADMIN, "p-a28", fixed)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("rolls back if the job changed between reading and writing", async () => {
    // Simulates another admin editing the title just before this correction reaches the database.
    const racing = {
      prepare: t.db.prepare.bind(t.db),
      batch: async (statements: D1PreparedStatement[]) => {
        await t.db
          .prepare(
            "UPDATE alumni_profiles SET job_title = 'Changed elsewhere' WHERE person_id = 'p-a01'",
          )
          .run();
        return t.db.batch(statements);
      },
    } as unknown as Pick<D1Database, "prepare" | "batch">;
    const store = new AlumniStore(racing, { now: () => t.now });
    await expect(
      store.correctJob(
        "p-a01",
        { employerId: "emp-harbor-pine", title: "Senior Associate", industryId: "consulting" },
        { type: "admin", memberId: ADMIN },
      ),
    ).rejects.toMatchObject({ code: "stale" });
    expect(await profile("p-a01")).toMatchObject({
      job_title: "Changed elsewhere",
      job_industry_id: "financial-services",
    });
    expect(await history("p-a01")).toEqual([]);
  });
});

describe("the correction route", () => {
  it("lets an admin correct a job", async () => {
    const response = await api(ADMIN, "POST", "alumni/p-a01/job", fixed);
    expect(response).toMatchObject({ status: 200, body: { status: "corrected" } });
    expect(await profile("p-a01")).toMatchObject({ job_title: "Senior Associate" });
  });

  it("answers with the valid industries when one is not on the list", async () => {
    const response = await api(ADMIN, "POST", "alumni/p-a01/job", {
      ...fixed,
      industryId: "astrology",
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ field: "industry" });
  });

  it("refuses a request with fields it does not know, and reading", async () => {
    expect(
      (await api(ADMIN, "POST", "alumni/p-a01/job", { ...fixed, startMonth: "2020-01" })).status,
    ).toBe(400);
    expect((await api(ADMIN, "GET", "alumni/p-a01/job")).status).toBe(405);
  });

  it.each([
    "member-example-01",
    "member-example-opener",
    "member-example-runner",
    "member-example-suspended",
  ] as const)("refuses %s", async (member) => {
    expect((await api(member, "POST", "alumni/p-a01/job", fixed)).status).toBe(403);
    expect(await history("p-a01")).toEqual([]);
  });
});
