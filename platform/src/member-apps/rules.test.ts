import { describe, expect, it } from "vitest";
import { appIdProblem } from "./rules";

describe("what a member app can be called", () => {
  it.each(["notes", "team-tracker", "a1b", "q4-sign-up-sheet", `a${"b".repeat(31)}`])(
    "accepts %s",
    (id) => {
      expect(appIdProblem(id, [])).toBeNull();
    },
  );

  it.each([
    ["too short", "ab"],
    ["too long", `a${"b".repeat(32)}`],
    ["starting with a digit", "1notes"],
    ["starting with a hyphen", "-notes"],
    ["ending with a hyphen", "notes-"],
    ["a doubled hyphen", "my--notes"],
    ["an internationalized-name prefix", "xn--notes"],
    ["upper case", "Notes"],
    ["a dot", "my.notes"],
    ["an underscore", "my_notes"],
    ["a space", "my notes"],
    ["empty", ""],
  ])("refuses a name %s", (_why, id) => {
    expect(appIdProblem(id, [])).toMatch(/3 to 32/);
  });

  it.each(["www", "api", "admin", "mail", "account", "mcp", "oauth", "slice", "sliceos", "login"])(
    "refuses the reserved name %s",
    (id) => {
      expect(appIdProblem(id, [])).toMatch(/reserved/);
    },
  );

  it("refuses a name that is or was in use", () => {
    expect(appIdProblem("alumni", ["alumni", "notes"])).toMatch(/already/);
    expect(appIdProblem("notes", ["alumni", "notes"])).toMatch(/already/);
    expect(appIdProblem("notes2", ["alumni", "notes"])).toBeNull();
  });
});
