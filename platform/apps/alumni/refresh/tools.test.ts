import { describe, expect, it } from "vitest";
import { useAlumniData } from "../tests/database";
import { callTool, toolNamed, type TestMember } from "../tests/members";
import { refreshTools } from "./tools";

const t = useAlumniData();
const tools = refreshTools(() => t.data);
const JORDAN = "https://www.linkedin.com/in/example-jordan-avery-15/details/experience/";
const filed = () => ({
  personId: "p-a01",
  sourceUrl: JORDAN,
  retrievedAt: t.now,
  outcome: "read",
  pageName: "Jordan Avery",
  currentJob: {
    employerName: "Harbor & Pine Capital",
    title: "Associate",
    industryId: "financial-services",
    startMonth: null,
    city: null,
    region: null,
    country: null,
  },
});
const inputs: Record<string, () => unknown> = {
  refresh_due: () => ({}),
  refresh_file: filed,
  refresh_graduates: () => ({}),
};

describe("refresh tools", () => {
  it("offers the three tools, marked as reading or changing data, all needing refresh.run", () => {
    expect(tools.map((tool) => [tool.name, tool.readOnly, tool.permission])).toEqual([
      ["refresh_due", true, "refresh.run"],
      ["refresh_file", false, "refresh.run"],
      ["refresh_graduates", false, "refresh.run"],
    ]);
  });

  it.each(Object.keys(inputs))("%s runs for a member with refresh.run", async (name) => {
    const result = await callTool(
      toolNamed(tools, name),
      "member-example-runner",
      inputs[name]?.(),
    );
    expect(result).not.toHaveProperty("message");
  });

  it.each(
    Object.keys(inputs).flatMap((name) =>
      (
        [
          "member-example-01",
          "member-example-admin",
          "member-example-opener",
          "member-example-suspended",
        ] as TestMember[]
      ).map((member) => [name, member] as const),
    ),
  )("%s is refused for %s, who lacks refresh.run or is suspended", async (name, member) => {
    await expect(callTool(toolNamed(tools, name), member, inputs[name]?.())).rejects.toMatchObject({
      status: 403,
    });
    expect(await t.db.prepare("SELECT count(*) AS n FROM alumni_refresh_checks").first()).toEqual({
      n: 7,
    });
  });

  it("does not hand a hidden link to a runner who is not an admin", async () => {
    const due = await callTool(toolNamed(tools, "refresh_due"), "member-example-runner");
    expect(JSON.stringify(due)).not.toContain("example-meilin-zhao");
    expect(JSON.stringify(due)).toContain("example-jordan-avery-15");
  });

  it("refuses input outside the declared limits", () => {
    expect(() => toolNamed(tools, "refresh_due").inputSchema.parse({ limit: 101 })).toThrow();
    expect(() => toolNamed(tools, "refresh_due").inputSchema.parse({ limit: 0 })).toThrow();
    expect(() => toolNamed(tools, "refresh_due").inputSchema.parse({ everyone: true })).toThrow();
    expect(() =>
      toolNamed(tools, "refresh_file").inputSchema.parse({ ...filed(), pageText: "copied text" }),
    ).toThrow();
    expect(() => toolNamed(tools, "refresh_graduates").inputSchema.parse({ year: 2027 })).toThrow();
  });

  it("says what went wrong instead of failing without a reason", async () => {
    const file = toolNamed(tools, "refresh_file");
    expect(
      await callTool(file, "member-example-runner", { ...filed(), personId: "nobody" }),
    ).toEqual({ status: "not_found" });
    const badIndustry = await callTool(file, "member-example-runner", {
      ...filed(),
      currentJob: { ...filed().currentJob, industryId: "astrology" },
    });
    expect(badIndustry).toMatchObject({ status: "invalid_choice", field: "industry" });
    expect(badIndustry.validChoices).toContainEqual({ id: "consulting", name: "Consulting" });
    expect(
      await callTool(file, "member-example-runner", { ...filed(), pageName: undefined }),
    ).toMatchObject({ status: "invalid" });
  });
});
