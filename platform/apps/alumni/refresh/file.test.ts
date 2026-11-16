import { describe, expect, it } from "vitest";
import { InvalidChoiceError } from "../data/reads";
import { AlumniDataError } from "../data/store";
import { count, useAlumniData } from "../tests/database";
import { refreshDue } from "./due";
import { refreshFile, type RefreshFileInput } from "./file";

const t = useAlumniData();
const address = (slug: string) => `https://www.linkedin.com/in/${slug}/details/experience/`;
const JORDAN = address("example-jordan-avery-15"); // p-a01: Associate at Harbor & Pine Capital
const SAM = address("example-sam-rivera-lopez"); // p-a07: Policy Analyst at Riverbend
const job = {
  employerName: "Harbor & Pine Capital",
  title: "Associate",
  industryId: "financial-services",
  startMonth: "2019-06",
  city: null,
  region: null,
  country: null,
};
const read = (overrides: Partial<RefreshFileInput> = {}): RefreshFileInput => ({
  personId: "p-a01",
  sourceUrl: JORDAN,
  retrievedAt: t.now,
  outcome: "read",
  pageName: "Jordan Avery",
  currentJob: job,
  ...overrides,
});
const checks = () => count(t.db, "alumni_refresh_checks");
const pending = () => count(t.db, "alumni_pending_changes WHERE status = 'pending'");
const lastCheck = () =>
  t.db
    .prepare(
      "SELECT person_id, source, checked_at, outcome, detail, pending_change_id FROM alumni_refresh_checks ORDER BY checked_at DESC, id DESC LIMIT 1",
    )
    .first<Record<string, unknown>>();
const proposal = (id: string) =>
  t.db
    .prepare(
      "SELECT record_id, field, current_value, proposed_value, source, found_at, status FROM alumni_pending_changes WHERE id = ?",
    )
    .bind(id)
    .first<Record<string, string>>();

describe("refresh_file", () => {
  it("step 1: writes nothing for an unknown, hidden or link-less alum", async () => {
    const before = [await checks(), await pending()];
    for (const personId of ["nobody", "p-a18", "p-a02", "p-a28"])
      expect(await refreshFile(t.data, read({ personId }))).toEqual({ status: "not_found" });
    expect([await checks(), await pending()]).toEqual(before);
  });

  it("step 2: writes nothing when the address is not the one worked out for the alum", async () => {
    const before = await checks();
    expect(await refreshFile(t.data, read({ sourceUrl: SAM }))).toEqual({
      status: "wrong_source",
    });
    expect(
      await refreshFile(
        t.data,
        read({ sourceUrl: "https://www.linkedin.com/in/example-jordan-avery-15" }),
      ),
    ).toEqual({ status: "wrong_source" });
    expect(await checks()).toBe(before);
  });

  it("step 3: refuses a result filed faster than the agreed gap, and writes nothing", async () => {
    expect(await refreshFile(t.data, read())).toEqual({ status: "unchanged" });
    const before = await checks();
    t.advance(4);
    expect(
      await refreshFile(t.data, read({ personId: "p-a07", sourceUrl: SAM, retrievedAt: t.now })),
    ).toEqual({ status: "too_fast", retryAfterSeconds: 6 });
    expect(await checks()).toBe(before);
    t.advance(6);
    expect(
      await refreshFile(
        t.data,
        read({
          personId: "p-a07",
          sourceUrl: SAM,
          retrievedAt: t.now,
          outcome: "unreachable",
          pageName: undefined,
          currentJob: undefined,
        }),
      ),
    ).toEqual({ status: "unreachable" });
  });

  it("step 4: logs an unreachable page with its short reason", async () => {
    const result = await refreshFile(
      t.data,
      read({
        outcome: "unreachable",
        detail: "sign-in page",
        pageName: undefined,
        currentJob: undefined,
      }),
    );
    expect(result).toEqual({ status: "unreachable" });
    expect(await lastCheck()).toEqual({
      person_id: "p-a01",
      source: JORDAN,
      checked_at: t.now,
      outcome: "unreachable",
      detail: "sign-in page",
      pending_change_id: null,
    });
    // An unreachable page is not a successful check, but the alum is not handed out again today.
    expect((await refreshDue(t.data, {})).due.map((alum) => alum.personId)).not.toContain("p-a01");
  });

  it("step 5: logs an error when the name on the page is someone else's, and accepts an alias", async () => {
    expect(await refreshFile(t.data, read({ pageName: "Jordan Avery-Smith" }))).toEqual({
      status: "name_mismatch",
    });
    expect(await lastCheck()).toMatchObject({
      outcome: "error",
      detail: "name on page does not match",
    });
    expect(await pending()).toBe(1); // only the seed's own pending proposal
    t.advance(11);
    const sam = await refreshFile(
      t.data,
      read({
        personId: "p-a07",
        sourceUrl: SAM,
        retrievedAt: t.now,
        pageName: "Sammy Rivera",
        currentJob: {
          ...job,
          employerName: "Riverbend Public Policy Institute",
          title: "policy analyst",
          industryId: "government-public-policy",
        },
      }),
    );
    expect(sam).toEqual({ status: "unchanged" });
  });

  it("step 7: logs an unchanged job as a successful check, using the server's time", async () => {
    const retrievedAt = new Date(Date.parse(t.now) - 3_600_000).toISOString();
    expect(
      await refreshFile(
        t.data,
        read({
          retrievedAt,
          currentJob: { ...job, startMonth: "2020-01", city: "Boston", country: "United States" },
        }),
      ),
    ).toEqual({ status: "unchanged" });
    expect(await lastCheck()).toMatchObject({
      outcome: "unchanged",
      checked_at: t.now,
      detail: null,
    });
    expect(await pending()).toBe(1);
    const due = await refreshDue(t.data, {});
    expect(due.due.map((alum) => alum.personId)).not.toContain("p-a01");
  });

  it("step 8: sends a page with no current role to manual review", async () => {
    expect(await refreshFile(t.data, read({ currentJob: null }))).toEqual({
      status: "needs_manual_review",
    });
    expect(await lastCheck()).toMatchObject({
      outcome: "skipped",
      detail: "page shows no current role",
    });
    expect(await pending()).toBe(1);
  });

  it("step 10: proposes a title correction and links the check to its proposal", async () => {
    const result = await refreshFile(
      t.data,
      read({ currentJob: { ...job, title: "Senior Associate" } }),
    );
    expect(result).toMatchObject({ status: "proposed" });
    if (result.status !== "proposed") throw new Error("expected a proposal");
    expect(await proposal(result.pendingChangeId)).toEqual({
      record_id: "p-a01",
      field: "job_title",
      current_value: "Associate",
      proposed_value: "Senior Associate",
      source: JORDAN,
      found_at: t.now,
      status: "pending",
    });
    expect(await lastCheck()).toMatchObject({
      outcome: "proposed",
      pending_change_id: result.pendingChangeId,
    });
    // Nothing changes until an admin approves.
    expect(
      await t.db.prepare("SELECT job_title FROM alumni_profiles WHERE person_id = 'p-a01'").first(),
    ).toEqual({ job_title: "Associate" });
  });

  it("step 10: proposes a new current job, adding a new employer and city once", async () => {
    const employers = await count(t.db, "alumni_employers");
    const cities = await count(t.db, "alumni_locations");
    const newJob = {
      employerName: "Juniper Row Partners",
      title: "Vice President",
      industryId: "real-estate",
      startMonth: "2026-08",
      city: "Austin",
      region: "TX",
      country: "United States",
    };
    const first = await refreshFile(t.data, read({ currentJob: newJob }));
    if (first.status !== "proposed") throw new Error("expected a proposal");
    const filed = await proposal(first.pendingChangeId);
    expect(filed?.field).toBe("current_job");
    const value = JSON.parse(filed?.proposed_value ?? "{}");
    expect(value).toMatchObject({
      title: "Vice President",
      industryId: "real-estate",
      startMonth: "2026-08",
    });
    expect(
      await t.db
        .prepare("SELECT name FROM alumni_employers WHERE id = ?")
        .bind(value.employerId)
        .first(),
    ).toEqual({ name: "Juniper Row Partners" });
    expect(
      await t.db
        .prepare("SELECT city, region FROM alumni_locations WHERE id = ?")
        .bind(value.locationId)
        .first(),
    ).toEqual({ city: "Austin", region: "TX" });

    // Step 9: the same change filed again gives one proposal, not two.
    t.advance(11);
    const again = await refreshFile(t.data, read({ retrievedAt: t.now, currentJob: newJob }));
    expect(again).toEqual({ status: "already_pending", pendingChangeId: first.pendingChangeId });
    expect(await lastCheck()).toMatchObject({
      outcome: "skipped",
      detail: "same change already waiting for review",
      pending_change_id: null,
    });
    expect(await pending()).toBe(2);
    expect(await count(t.db, "alumni_employers")).toBe(employers + 1);
    expect(await count(t.db, "alumni_locations")).toBe(cities + 1);
  });

  it("uses the industry already recorded for a known employer, and no city without a country", async () => {
    const result = await refreshFile(
      t.data,
      read({
        currentJob: {
          employerName: "bluestone advisory group",
          title: "Engagement Manager",
          industryId: "technology",
          startMonth: null,
          city: "Chicago",
          region: null,
          country: null,
        },
      }),
    );
    if (result.status !== "proposed") throw new Error("expected a proposal");
    expect(JSON.parse((await proposal(result.pendingChangeId))?.proposed_value ?? "{}")).toEqual({
      employerId: "emp-bluestone",
      title: "Engagement Manager",
      industryId: "consulting",
      locationId: null,
      startMonth: null,
    });
  });

  it("from the due list to an approved change: the profile updates and the old job moves to past jobs", async () => {
    const due = await refreshDue(t.data, {});
    const alum = due.due.find((item) => item.personId === "p-a01");
    if (!alum) throw new Error("expected p-a01 to be due");
    const result = await refreshFile(
      t.data,
      read({
        sourceUrl: alum.experienceUrl,
        currentJob: {
          ...job,
          employerName: "Quarry Street Consulting",
          title: "Principal",
          industryId: "consulting",
          startMonth: "2026-09",
        },
      }),
    );
    if (result.status !== "proposed") throw new Error("expected a proposal");
    expect(await pending()).toBe(2);
    await t.data.store.reviewChange(result.pendingChangeId, "approved", "member-example-admin");
    const profile = await t.data.reads.getAlum({ memberId: "anyone", admin: false }, "p-a01");
    expect(profile).toMatchObject({ employer: "Quarry Street Consulting", title: "Principal" });
    expect(profile?.pastJobs[0]).toMatchObject({
      employer: "Harbor & Pine Capital",
      title: "Associate",
    });
  });

  it("refuses a malformed result before writing anything", async () => {
    const before = await checks();
    await expect(refreshFile(t.data, read({ pageName: undefined }))).rejects.toThrow(
      AlumniDataError,
    );
    await expect(refreshFile(t.data, read({ currentJob: undefined }))).rejects.toThrow(
      AlumniDataError,
    );
    await expect(refreshFile(t.data, read({ detail: "sign-in page" }))).rejects.toThrow(
      AlumniDataError,
    );
    const tooOld = new Date(Date.parse(t.now) - 25 * 3_600_000).toISOString();
    const tooNew = new Date(Date.parse(t.now) + 6 * 60_000).toISOString();
    await expect(refreshFile(t.data, read({ retrievedAt: tooOld }))).rejects.toThrow(/24 hours/);
    await expect(refreshFile(t.data, read({ retrievedAt: tooNew }))).rejects.toThrow(/24 hours/);
    await expect(
      refreshFile(t.data, read({ currentJob: { ...job, industryId: "astrology" } })),
    ).rejects.toBeInstanceOf(InvalidChoiceError);
    expect(await checks()).toBe(before);
  });
});
