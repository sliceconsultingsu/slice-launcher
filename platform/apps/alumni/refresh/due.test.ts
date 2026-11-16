import { describe, expect, it } from "vitest";
import { useAlumniData } from "../tests/database";
import { refreshDue } from "./due";
import { experienceUrl } from "./linkedin";

const t = useAlumniData();
const address = (slug: string) => `https://www.linkedin.com/in/${slug}/details/experience/`;
const JORDAN = address("example-jordan-avery-15"); // p-a01
const SAM = address("example-sam-rivera-lopez"); // p-a07
const hoursAgo = (hours: number) => new Date(Date.parse(t.now) - hours * 3_600_000).toISOString();
const check = (
  personId: string,
  source: string,
  checkedAt: string,
  outcome: "unchanged" | "error",
) =>
  t.data.store.recordRefreshCheck({
    personId,
    source,
    checkedAt,
    outcome,
    detail: outcome === "error" ? "name on page does not match" : null,
  });
const addLink = (id: string, personId: string, value: string, updatedAt = t.now) =>
  t.db
    .prepare(
      "INSERT INTO alumni_contacts(id, person_id, kind, value, value_key, created_at, updated_at) VALUES (?, ?, 'linkedin', ?, ?, ?, ?)",
    )
    .bind(id, personId, value, value.toLowerCase(), updatedAt, updatedAt)
    .run();
const dueIds = async (limit?: number) =>
  (await refreshDue(t.data, { limit })).due.map((alum) => alum.personId);

describe("refresh_due", () => {
  it("lists never-checked alumni first, then the longest since a successful check", async () => {
    await check("p-a07", SAM, hoursAgo(24 * 200), "unchanged");
    const result = await refreshDue(t.data, {});
    expect(result.due).toEqual([
      { personId: "p-a01", fullName: "Jordan Avery", experienceUrl: JORDAN, lastCheckedAt: null },
      {
        personId: "p-a12",
        fullName: "Mei-Lin Zhao",
        experienceUrl: address("example-meilin-zhao"),
        lastCheckedAt: null,
      },
      {
        personId: "p-a07",
        fullName: "Samantha Rivera-Lopez",
        experienceUrl: SAM,
        lastCheckedAt: hoursAgo(24 * 200),
      },
    ]);
    expect(result.remaining).toBe(0);
    expect(result.minGapSeconds).toBe(10);
    expect(result.industries).toHaveLength(15);
    expect(result.industries).toContainEqual({ id: "consulting", name: "Consulting" });
  });

  it("leaves out an alum with a successful check inside the interval", async () => {
    await check("p-a01", JORDAN, hoursAgo(24 * 119), "unchanged");
    expect(await dueIds()).toEqual(["p-a07", "p-a12"]);
    t.advance(2 * 86_400);
    // Due again, after the two who have never been checked.
    expect(await dueIds()).toEqual(["p-a07", "p-a12", "p-a01"]);
  });

  it("holds back an alum with a failed check only for the recheck period", async () => {
    await check("p-a01", JORDAN, hoursAgo(2), "error");
    expect(await dueIds()).toEqual(["p-a07", "p-a12"]);
    t.advance(19 * 3600);
    expect(await dueIds()).toEqual(["p-a01", "p-a07", "p-a12"]);
  });

  it("leaves out hidden and merged alumni, and reports listed alumni it cannot check", async () => {
    await addLink("c-hidden", "p-a18", "https://www.linkedin.com/in/example-theo-marchetti");
    await addLink("c-merged", "p-a28", "https://www.linkedin.com/in/example-patrick-kim");
    await addLink("c-company", "p-a02", "https://www.linkedin.com/company/example-co");
    const result = await refreshDue(t.data, {});
    expect(result.due.map((alum) => alum.personId)).toEqual(["p-a01", "p-a07", "p-a12"]);
    const reasons = new Map(result.notCheckable.map((alum) => [alum.personId, alum.reason]));
    expect(reasons.get("p-a02")).toBe("bad-linkedin-link");
    expect(reasons.get("p-a03")).toBe("no-linkedin-link");
    expect(reasons.has("p-a18")).toBe(false);
    expect(reasons.has("p-a28")).toBe(false);
    expect(reasons.has("p-a01")).toBe(false);
    // 28 listed alumni, 3 of them checkable.
    expect(result.notCheckable).toHaveLength(25);
  });

  it("uses the most recently updated usable link when an alum has several", async () => {
    await addLink(
      "c-newer",
      "p-a01",
      "linkedin.com/in/example-jordan-new",
      "2026-11-10T00:00:00.000Z",
    );
    await addLink(
      "c-newest",
      "p-a01",
      "https://example.com/not-a-profile",
      "2026-11-12T00:00:00.000Z",
    );
    const result = await refreshDue(t.data, {});
    expect(result.due[0]?.experienceUrl).toBe(experienceUrl("linkedin.com/in/example-jordan-new"));
  });

  it("returns at most the limit and says how many more are due", async () => {
    const result = await refreshDue(t.data, { limit: 1 });
    expect(result.due.map((alum) => alum.personId)).toEqual(["p-a01"]);
    expect(result.remaining).toBe(2);
  });

  it("returns no email, phone, job or other profile detail", async () => {
    const text = JSON.stringify(await refreshDue(t.data, {}));
    expect(text).not.toMatch(/@example\.com|555-01|Associate|Harbor|Tax Senior/);
    for (const alum of (await refreshDue(t.data, {})).due)
      expect(Object.keys(alum).sort()).toEqual([
        "experienceUrl",
        "fullName",
        "lastCheckedAt",
        "personId",
      ]);
  });
});
