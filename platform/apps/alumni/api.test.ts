// The app's API as each kind of member would reach it, through the platform's real dispatch.
import { describe, expect, it } from "vitest";
import { alumniApi } from "./api";
import { MATCHES_PER_PERIOD } from "./matching/config";
import { count, useAlumniData } from "./tests/database";
import { apiAs, type TestMember } from "./tests/members";

const t = useAlumniData();
const api = apiAs((props) => alumniApi(props, () => t.data));
const RILEY: TestMember = "member-example-01";
const ADMIN: TestMember = "member-example-admin";
const answers = {
  graduationYear: 2028,
  majorIds: ["finance"],
  careerGoal: "Work in strategy consulting after graduation.",
  skillIds: ["excel"],
  industryIds: ["consulting"],
  locationIds: ["loc-nyc"],
  helpKindIds: ["career-advice"],
  linkedinUrl: null,
};
type Body = Record<string, unknown>;

describe("browsing alumni", () => {
  it("lists every listed alum and no hidden one", async () => {
    const response = await api(RILEY, "GET", "alumni?limit=50");
    const body = response.body as { results: { id: string }[]; total: number };
    expect(response.status).toBe(200);
    expect(body.total).toBe(28);
    expect(body.results.map((alum) => alum.id)).not.toContain("p-a18");
  });

  it("lets only an admin include hidden alumni", async () => {
    const asMember = (await api(RILEY, "GET", "alumni?includeHidden=1&limit=50")).body as Body;
    expect(asMember.total).toBe(28);
    const asAdmin = (await api(ADMIN, "GET", "alumni?includeHidden=1&limit=50")).body as Body;
    expect(asAdmin.total).toBe(29);
  });

  it("refuses a malformed search and names the valid choices for an unknown one", async () => {
    expect((await api(RILEY, "GET", "alumni?limit=many")).status).toBe(400);
    expect((await api(RILEY, "GET", "alumni?shoeSize=9")).status).toBe(400);
    const unknown = await api(RILEY, "GET", "alumni?industry=astrology");
    expect(unknown.status).toBe(400);
    expect((unknown.body as { validChoices: unknown[] }).validChoices).toContainEqual({
      id: "consulting",
      name: "Consulting",
    });
  });

  it("shows a profile to a member without hidden details, and nothing for a hidden alum", async () => {
    const profile = (await api(RILEY, "GET", "alumni/p-a09")).body as {
      alum: { contacts: unknown[] };
    };
    expect(profile.alum.contacts).toEqual([
      { kind: "email", label: null, value: "marcus.b@example.com" },
    ]);
    expect((await api(RILEY, "GET", "alumni/p-a18")).status).toBe(404);
    expect((await api(ADMIN, "GET", "alumni/p-a18")).status).toBe(200);
  });

  it("never changes data on a read, and refuses writes to read-only routes", async () => {
    expect((await api(RILEY, "POST", "alumni", {})).status).toBe(405);
    expect((await api(RILEY, "POST", "lists", {})).status).toBe(405);
    expect((await api(RILEY, "GET", "me/profile")).status).toBe(405);
    expect((await api(RILEY, "GET", "nothing-here")).status).toBe(404);
  });
});

describe("a student's own profile and matches", () => {
  it("says who is signed in, whether they are an admin and whether they have a profile", async () => {
    expect((await api("member-example-new", "GET", "me")).body).toEqual({
      name: "Morgan Example",
      admin: false,
      profile: null,
    });
    expect((await api(ADMIN, "GET", "me")).body).toMatchObject({ admin: true });
    expect((await api(RILEY, "GET", "me")).body).toMatchObject({
      admin: false,
      profile: { name: "Riley Chen", complete: true },
    });
  });

  it("saves the first-use profile and shows a changed answer after reloading", async () => {
    const saved = await api("member-example-new", "PUT", "me/profile", answers);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ profile: { industryIds: ["consulting"], complete: true } });
    await api("member-example-new", "PUT", "me/profile", {
      ...answers,
      industryIds: ["technology"],
    });
    expect((await api("member-example-new", "GET", "me")).body).toMatchObject({
      profile: { industryIds: ["technology"] },
    });
  });

  it("refuses an invalid profile with the valid choices, and unknown fields", async () => {
    const invalid = await api("member-example-new", "PUT", "me/profile", {
      ...answers,
      helpKindIds: ["free-lunch"],
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ field: "kind of help" });
    expect(
      (await api("member-example-new", "PUT", "me/profile", { ...answers, memberId: "x" })).status,
    ).toBe(400);
    expect((await api("member-example-new", "GET", "me")).body).toMatchObject({ profile: null });
  });

  it("gives matches on request, keeps earlier ones, and records what the student did", async () => {
    expect((await api(RILEY, "GET", "me/matches")).body).toEqual({ matches: [] });
    const given = (await api(RILEY, "POST", "me/matches", {})).body as {
      matching: Body;
      matches: { id: string }[];
    };
    expect(given.matching).toMatchObject({ status: "matched" });
    expect(given.matches).toHaveLength(MATCHES_PER_PERIOD);
    const id = given.matches[0]?.id ?? "";
    expect(
      (await api(RILEY, "POST", `me/matches/${id}/outcome`, { outcome: "contacted" })).status,
    ).toBe(200);
    const after = (await api(RILEY, "GET", "me/matches")).body as {
      matches: { id: string; outcome: string | null }[];
    };
    expect(after.matches.find((match) => match.id === id)?.outcome).toBe("contacted");
    // Another student cannot touch Riley's match, and an unknown outcome is refused.
    expect(
      (await api("member-example-02", "POST", `me/matches/${id}/outcome`, { outcome: "contacted" }))
        .status,
    ).toBe(404);
    expect(
      (await api(RILEY, "POST", `me/matches/${id}/outcome`, { outcome: "married" })).status,
    ).toBe(400);
  });
});

describe("admin actions", () => {
  it("hides an alum from members and lists them again", async () => {
    expect((await api(ADMIN, "POST", "alumni/p-a09/listing", { status: "hidden" })).status).toBe(
      200,
    );
    expect((await api(RILEY, "GET", "alumni/p-a09")).status).toBe(404);
    expect((await api(ADMIN, "POST", "alumni/p-a09/listing", { status: "listed" })).status).toBe(
      200,
    );
    expect((await api(RILEY, "GET", "alumni/p-a09")).status).toBe(200);
    expect(await count(t.db, "alumni_change_history WHERE field = 'listing_status'")).toBe(2);
  });

  it("hides one contact detail from members", async () => {
    expect(
      (await api(ADMIN, "POST", "contacts/c-10/visibility", { visibility: "hidden" })).status,
    ).toBe(200);
    const profile = (await api(RILEY, "GET", "alumni/p-a09")).body as {
      alum: { contacts: unknown[] };
    };
    expect(profile.alum.contacts).toEqual([]);
  });

  it.each(["member-example-01", "member-example-runner", "member-example-suspended"] as const)(
    "refuses %s",
    async (member) => {
      expect((await api(member, "POST", "alumni/p-a09/listing", { status: "hidden" })).status).toBe(
        403,
      );
      expect(
        (await api(member, "POST", "contacts/c-10/visibility", { visibility: "hidden" })).status,
      ).toBe(403);
      expect((await api(RILEY, "GET", "alumni/p-a09")).status).toBe(200);
    },
  );
});

describe("members without the app's actions", () => {
  it.each(["member-example-opener", "member-example-runner", "member-example-suspended"] as const)(
    "refuses %s on every student route",
    async (member) => {
      for (const path of ["alumni", "alumni/p-a09", "lists", "me", "me/matches", "records"])
        expect((await api(member, "GET", path)).status).toBe(403);
      expect((await api(member, "PUT", "me/profile", answers)).status).toBe(403);
      expect((await api(member, "POST", "me/matches", {})).status).toBe(403);
    },
  );
});
