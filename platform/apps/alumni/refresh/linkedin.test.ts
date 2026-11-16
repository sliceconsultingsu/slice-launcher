import { describe, expect, it } from "vitest";
import { experienceUrl } from "./linkedin";

const expected = "https://www.linkedin.com/in/example-alex-1/details/experience/";

describe("experienceUrl", () => {
  it.each([
    "linkedin.com/in/example-alex-1",
    "www.linkedin.com/in/example-alex-1",
    "http://linkedin.com/in/example-alex-1",
    "https://www.linkedin.com/in/example-alex-1",
    "https://www.linkedin.com/in/example-alex-1/",
    "https://www.linkedin.com/in/example-alex-1?utm_source=share",
    "https://www.linkedin.com/in/example-alex-1/details/education/",
    "  HTTPS://WWW.LinkedIn.com/in/example-alex-1#about  ",
  ])("builds the experience address from %s", (value) => {
    expect(experienceUrl(value)).toBe(expected);
  });

  it("keeps underscores and percent signs in the profile name", () => {
    expect(experienceUrl("linkedin.com/in/example_ren%C3%A9e")).toBe(
      "https://www.linkedin.com/in/example_ren%C3%A9e/details/experience/",
    );
  });

  it.each([
    ["a non-LinkedIn address", "https://example.com/in/example-alex-1"],
    ["a company page", "https://www.linkedin.com/company/example-co"],
    ["a look-alike host", "https://notlinkedin.com/in/example-alex-1"],
    ["a profile name that is too short", "linkedin.com/in/ab"],
    ["a profile name that is too long", `linkedin.com/in/${"a".repeat(101)}`],
    ["an empty value", ""],
    ["plain text", "ask Alex for the link"],
  ])("returns nothing for %s", (_label, value) => {
    expect(experienceUrl(value)).toBeNull();
  });
});
