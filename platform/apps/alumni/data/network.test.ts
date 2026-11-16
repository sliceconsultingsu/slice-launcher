import { describe, expect, it } from "vitest";
import { alumniApi } from "../api";
import { useAlumniData } from "../tests/database";
import { apiAs } from "../tests/members";
import { ACTIVITY_DAYS, networkSummary, recentActivity, type ActivityItem } from "./network";

const t = useAlumniData();
const api = apiAs((props) => alumniApi(props, () => t.data));
const ADMIN = { type: "admin", memberId: "member-example-admin" } as const;
const activity = () => recentActivity(t.db, t.now);
const jobOf = (items: ActivityItem[], id: string) =>
  items.find((item) => item.kind === "job" && item.alum.id === id);
const hide = (personId: string) =>
  t.data.store.editField(
    { entity: "alumni_profile", recordId: personId, field: "listing_status" },
    "hidden",
    ADMIN,
  );

describe("the network summary", () => {
  it("counts listed alumni, their employers and their industries, largest first", async () => {
    const summary = await networkSummary(t.db);
    expect(summary.alumni).toBe(28);
    expect(summary.companies).toBeGreaterThan(5);
    expect(summary.industries.find((industry) => industry.id === "consulting")).toEqual({
      id: "consulting",
      name: "Consulting",
      alumni: 4,
    });
    const sizes = summary.industries.map((industry) => industry.alumni);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(summary.employers.length).toBeLessThanOrEqual(5);
    expect(summary.employers[0]?.alumni).toBeGreaterThanOrEqual(summary.employers[1]?.alumni ?? 0);
  });

  it("leaves out an alum once they are hidden", async () => {
    const before = await networkSummary(t.db);
    await hide("p-a09");
    const after = await networkSummary(t.db);
    expect(after.alumni).toBe(before.alumni - 1);
    expect(after.industries.find((industry) => industry.id === "consulting")?.alumni).toBe(3);
  });
});

describe("what changed lately", () => {
  it("describes a title change by the job on the profile today", async () => {
    expect(jobOf(await activity(), "p-a11")).toEqual({
      kind: "job",
      at: "2026-09-05T12:00:00.000Z",
      alum: { id: "p-a11", name: "Devon Okafor" },
      title: "Operations Director",
      employer: expect.any(String),
      moved: false,
      // The earlier title of the same job is not on the profile, so it is not repeated here.
      before: null,
    });
  });

  it("reports a move to a new employer with the job before it", async () => {
    await t.data.store.changeJob(
      "p-a01",
      {
        employerId: "emp-quarry",
        title: "Principal",
        industryId: "consulting",
        locationId: "loc-bos",
        startMonth: "2026-11",
      },
      ADMIN,
    );
    expect(jobOf(await activity(), "p-a01")).toMatchObject({
      title: "Principal",
      moved: true,
      before: "Associate at Harbor & Pine Capital",
      at: t.now,
    });
  });

  it("groups alumni added on the same day into one entry that names only a few", async () => {
    const joined = (await activity()).filter((item) => item.kind === "joined");
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ count: 28, at: "2026-10-01T12:00:00.000Z" });
    expect(joined[0]?.kind === "joined" && joined[0].alumni).toHaveLength(3);
  });

  it("says what an alum offers after their help is updated", async () => {
    await t.data.store.setHelpOffered(
      "p-a02",
      ["resume-review", "career-advice"],
      "member-example-admin",
    );
    expect((await activity()).find((item) => item.kind === "help")).toEqual({
      kind: "help",
      at: t.now,
      alum: { id: "p-a02", name: expect.any(String) },
      help: ["Career advice", "Resume review"],
    });
  });

  it("never names a hidden alum and forgets changes older than the window", async () => {
    await hide("p-a11");
    expect(jobOf(await activity(), "p-a11")).toBeUndefined();
    t.advance((ACTIVITY_DAYS + 60) * 86_400);
    expect(await activity()).toEqual([]);
  });

  it("is newest first and never longer than the limit", async () => {
    const items = await recentActivity(t.db, t.now, 1);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("joined");
  });
});

describe("the network route", () => {
  it("gives a member the summary and the activity, and refuses writes", async () => {
    const response = await api("member-example-01", "GET", "network");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ summary: { alumni: 28 } });
    expect((response.body as { activity: unknown[] }).activity.length).toBeGreaterThan(0);
    expect((await api("member-example-01", "POST", "network", {})).status).toBe(405);
  });

  it("refuses a member who may open the app but not read its records", async () => {
    expect((await api("member-example-opener", "GET", "network")).status).toBe(403);
    expect((await api("member-example-suspended", "GET", "network")).status).toBe(403);
  });
});
