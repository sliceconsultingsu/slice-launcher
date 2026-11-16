import { describe, expect, it } from "vitest";
import { alumniApi } from "../api";
import { count, useAlumniData } from "../tests/database";
import { apiAs, type TestMember } from "../tests/members";

const t = useAlumniData();
const api = apiAs((props) => alumniApi(props, () => t.data));
const everyoneElse: TestMember[] = [
  "member-example-01",
  "member-example-runner",
  "member-example-opener",
  "member-example-suspended",
];
const jobTitle = (personId: string) =>
  t.db
    .prepare("SELECT job_title FROM alumni_profiles WHERE person_id = ?")
    .bind(personId)
    .first<{ job_title: string }>()
    .then((row: { job_title: string } | null) => row?.job_title);

describe("reviewing proposed changes", () => {
  it("lists pending proposals for an admin, oldest first, in words", async () => {
    const jobProposal = await t.data.store.proposeChange({
      entity: "alumni_profile",
      recordId: "p-a01",
      field: "current_job",
      proposedValue: {
        employerId: "emp-quarry",
        title: "Principal",
        industryId: "consulting",
        locationId: "loc-bos",
        startMonth: "2026-09",
      },
      source: "https://www.linkedin.com/in/example-jordan-avery-15/details/experience/",
      foundAt: t.now,
    });
    const response = await api("member-example-admin", "GET", "proposals");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      proposals: [
        {
          id: "pc-01",
          personId: "p-a26",
          name: "Victor Osei",
          change: "Job title correction",
          current: "Consultant",
          proposed: "Senior Consultant",
          source: "https://example.com/news/bluestone-promotions",
          foundAt: "2026-10-05T08:00:00.000Z",
        },
        {
          id: jobProposal,
          personId: "p-a01",
          name: "Jordan Avery",
          change: "New current job",
          current:
            "Associate at Harbor & Pine Capital · Financial Services · New York, NY · since 2019-06",
          proposed:
            "Principal at Quarry Street Consulting · Consulting · Boston, MA · since 2026-09",
          source: "https://www.linkedin.com/in/example-jordan-avery-15/details/experience/",
          foundAt: t.now,
        },
      ],
    });
  });

  it("approving applies the change with the reviewer recorded", async () => {
    const response = await api("member-example-admin", "POST", "proposals/pc-01/review", {
      decision: "approved",
    });
    expect(response).toEqual({ status: 200, body: { status: "approved" } });
    expect(await jobTitle("p-a26")).toBe("Senior Consultant");
    expect(
      await t.db
        .prepare("SELECT status, reviewed_by FROM alumni_pending_changes WHERE id = 'pc-01'")
        .first(),
    ).toEqual({ status: "approved", reviewed_by: "member-example-admin" });
    expect(await count(t.db, "alumni_change_history WHERE pending_change_id = 'pc-01'")).toBe(1);
    expect((await api("member-example-admin", "GET", "proposals")).body).toEqual({ proposals: [] });
  });

  it("rejecting changes nothing on the profile", async () => {
    const history = await count(t.db, "alumni_change_history");
    const response = await api("member-example-admin", "POST", "proposals/pc-01/review", {
      decision: "rejected",
    });
    expect(response.status).toBe(200);
    expect(await jobTitle("p-a26")).toBe("Consultant");
    expect(await count(t.db, "alumni_change_history")).toBe(history);
  });

  it("refuses a stale proposal with a plain message and leaves it pending", async () => {
    await t.data.store.editField(
      { entity: "alumni_profile", recordId: "p-a26", field: "job_title" },
      "Engagement Manager",
      { type: "admin", memberId: "member-example-admin" },
    );
    const response = await api("member-example-admin", "POST", "proposals/pc-01/review", {
      decision: "approved",
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "stale",
      error: expect.stringContaining("changed after this proposal was made"),
    });
    expect(await jobTitle("p-a26")).toBe("Engagement Manager");
    expect(
      await count(t.db, "alumni_pending_changes WHERE id = 'pc-01' AND status = 'pending'"),
    ).toBe(1);
  });

  it("refuses a proposal someone already reviewed, an unknown one and a malformed decision", async () => {
    await api("member-example-admin", "POST", "proposals/pc-01/review", { decision: "rejected" });
    const again = await api("member-example-admin", "POST", "proposals/pc-01/review", {
      decision: "approved",
    });
    expect(again.status).toBe(409);
    expect(await jobTitle("p-a26")).toBe("Consultant");
    expect(
      (
        await api("member-example-admin", "POST", "proposals/nothing/review", {
          decision: "approved",
        })
      ).status,
    ).toBe(404);
    expect(
      (await api("member-example-admin", "POST", "proposals/pc-01/review", { decision: "maybe" }))
        .status,
    ).toBe(400);
    expect((await api("member-example-admin", "GET", "proposals/pc-01/review")).status).toBe(405);
  });

  it.each(everyoneElse)("refuses %s, who is not an admin or is suspended", async (member) => {
    expect((await api(member, "GET", "proposals")).status).toBe(403);
    expect(
      (await api(member, "POST", "proposals/pc-01/review", { decision: "approved" })).status,
    ).toBe(403);
    expect(await jobTitle("p-a26")).toBe("Consultant");
  });
});
