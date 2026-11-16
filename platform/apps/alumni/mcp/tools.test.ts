import { describe, expect, it } from "vitest";
import { alumniApi } from "../api";
import { MATCHES_PER_PERIOD } from "../matching/config";
import { refreshTools } from "../refresh/tools";
import { useAlumniData } from "../tests/database";
import { apiAs, callTool, toolNamed, type TestMember } from "../tests/members";
import { studentTools } from "./tools";

const t = useAlumniData();
const tools = studentTools(() => t.data);
const api = apiAs((props) => alumniApi(props, () => t.data));
const call = (name: string, member: TestMember, input: unknown = {}) =>
  callTool(toolNamed(tools, name), member, input);
const RILEY: TestMember = "member-example-01";
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
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

describe("student tools", () => {
  it("offers the six tools, and marks only the two that can change data as changing it", () => {
    expect(tools.map((tool) => [tool.name, tool.readOnly, tool.permission])).toEqual([
      ["search", true, "records.read"],
      ["get", true, "records.read"],
      ["lists", true, "records.read"],
      ["my_profile", true, "records.read"],
      ["update_my_profile", false, "records.read"],
      ["my_matches", false, "records.read"],
    ]);
    // With the refresh tools, every tool name is unique and fits the platform's rules.
    const names = [...tools, ...refreshTools(() => t.data)].map((tool) => tool.name);
    expect(new Set(names).size).toBe(9);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
      expect(tool.description.length).toBeLessThanOrEqual(1000);
      expect(tool.description).toContain("Example:");
    }
  });

  it("search returns the same alumni as the same search on the screen", async () => {
    for (const [input, query] of [
      [{}, ""],
      [{ industry: "consulting", sort: "year" }, "industry=consulting&sort=year"],
      [{ q: "avery", limit: 5 }, "q=avery&limit=5"],
      [{ school: "whitman", yearFrom: 2015, offset: 2 }, "school=whitman&yearFrom=2015&offset=2"],
    ] as const) {
      const fromTool = await call("search", RILEY, input);
      const fromScreen = await api(RILEY, "GET", `alumni?${query}`);
      expect(fromScreen.status).toBe(200);
      expect(fromTool).toEqual(fromScreen.body);
    }
  });

  it("returns a first page and a way to ask for the next, within the size limit", async () => {
    const first = await call("search", RILEY, {});
    expect(first).toMatchObject({ total: 28, nextOffset: 25 });
    const next = await call("search", RILEY, { offset: first.nextOffset });
    expect(next).toMatchObject({ nextOffset: null });
    expect((next.results as unknown[]).length).toBe(3);
    expect(bytes(await call("search", RILEY, { limit: 50 }))).toBeLessThan(64 * 1024);
    expect(bytes(await call("lists", RILEY))).toBeLessThan(64 * 1024);
    expect(() => toolNamed(tools, "search").inputSchema.parse({ limit: 51 })).toThrow();
    expect(() => toolNamed(tools, "search").inputSchema.parse({ q: "x".repeat(81) })).toThrow();
  });

  it("never returns a hidden alum, a merged record or a hidden contact detail, even to an admin", async () => {
    for (const member of [RILEY, "member-example-admin"] as const) {
      const everything = JSON.stringify([
        await call("search", member, { limit: 50 }),
        await call("get", member, { id: "p-a09" }),
        await call("get", member, { id: "p-a18" }),
        await call("get", member, { id: "p-a28" }),
      ]);
      expect(everything).not.toContain("Theo Marchetti"); // hidden alum
      expect(everything).not.toContain("Patrick Kim"); // merged record
      expect(everything).not.toContain("555-0142"); // hidden phone number
      expect(everything).toContain("marcus.b@example.com"); // shared with members
    }
    expect(() => toolNamed(tools, "search").inputSchema.parse({ includeHidden: true })).toThrow();
    expect(await call("get", RILEY, { id: "p-a18" })).toMatchObject({ status: "not_found" });
  });

  it("get returns the profile as the profile screen shows it", async () => {
    const fromTool = await call("get", RILEY, { id: "p-a09" });
    const fromScreen = await api(RILEY, "GET", "alumni/p-a09");
    expect(fromTool).toEqual(fromScreen.body);
    expect(fromTool).toMatchObject({ alum: { name: "Marcus Bellweather" } });
  });

  it("lists returns the allowed choices", async () => {
    const lists = await call("lists", RILEY);
    expect(Object.keys(lists).sort()).toEqual([
      "cities",
      "helpKinds",
      "inUse",
      "industries",
      "majors",
      "schools",
      "skills",
    ]);
    expect(lists).toEqual((await api(RILEY, "GET", "lists")).body);
  });

  it("gives clear errors: an invalid choice lists the valid ones", async () => {
    const result = await call("search", RILEY, { industry: "astrology" });
    expect(result).toMatchObject({ status: "invalid_choice", field: "industry" });
    expect(result.validChoices).toContainEqual({ id: "consulting", name: "Consulting" });
    const saved = await call("update_my_profile", RILEY, { ...answers, skillIds: ["juggling"] });
    expect(saved).toMatchObject({ status: "invalid_choice", field: "skill" });
  });

  it("reads and changes only the signed-in student's own profile", async () => {
    expect(await call("my_profile", "member-example-new")).toMatchObject({
      status: "profile_needed",
    });
    const saved = await call("update_my_profile", "member-example-new", answers);
    expect(saved).toMatchObject({
      status: "saved",
      profile: { name: "Morgan Example", industryIds: ["consulting"], complete: true },
    });
    expect(await call("my_profile", "member-example-new")).toEqual({ profile: saved.profile });
    // Riley's own answers are untouched, and nobody else's appear in Riley's result.
    const riley = await call("my_profile", RILEY);
    expect(riley).toMatchObject({ profile: { name: "Riley Chen", graduationYear: 2027 } });
    expect(JSON.stringify(riley)).not.toContain("Morgan Example");
    // A tool has no way to name another member: unknown input is refused outright.
    expect(() =>
      toolNamed(tools, "my_profile").inputSchema.parse({ memberId: "member-example-02" }),
    ).toThrow();
    expect(() =>
      toolNamed(tools, "update_my_profile").inputSchema.parse({ ...answers, memberId: "x" }),
    ).toThrow();
  });

  it("my_matches gives the current and earlier matches with their reasons", async () => {
    const first = await call("my_matches", RILEY);
    expect(first.matching).toMatchObject({ status: "matched", newMatches: MATCHES_PER_PERIOD });
    const matches = first.matches as { reasons: string[]; alum: { id: string } }[];
    expect(matches).toHaveLength(MATCHES_PER_PERIOD);
    expect(matches.every((match) => match.reasons.length > 0)).toBe(true);
    // Asking again changes nothing until the period has passed.
    const again = await call("my_matches", RILEY);
    expect(again.matching).toMatchObject({ status: "not-due" });
    expect(again.matches).toEqual(first.matches);
    expect(again.matches).toEqual(
      ((await api(RILEY, "GET", "me/matches")).body as { matches: unknown }).matches,
    );
    // Another student's matches never appear.
    expect((await call("my_matches", "member-example-new")).matches).toEqual([]);
  });

  it.each(
    ["search", "get", "lists", "my_profile", "update_my_profile", "my_matches"].flatMap((name) =>
      (["member-example-opener", "member-example-runner", "member-example-suspended"] as const).map(
        (member) => [name, member] as const,
      ),
    ),
  )("%s is refused for %s, who lacks records.read or is suspended", async (name, member) => {
    const input = name === "get" ? { id: "p-a09" } : name === "update_my_profile" ? answers : {};
    await expect(call(name, member, input)).rejects.toMatchObject({ status: 403 });
  });
});
