import { describe, expect, it } from "vitest";
import { parseRows } from "./contact-book";

// The contact book's own headings, with the stray spaces a hand-kept sheet has. People invented.
const HEADINGS = "Name,Company,Role,Industry,Email ,LinkedIn ,Grad Year,Date updated ";

describe("reading rows pasted from the contact book", () => {
  it("reads the sheet's columns from a comma-separated export, including a quoted date", () => {
    const parsed = parseRows(
      [
        HEADINGS,
        'Dana Whitcombe,Juniper Row Partners,Associate,Finance,dana@example.com,https://www.linkedin.com/in/example-dana/,2024,"April 1, 2025"',
        'Eli Marsh,,,,,https://www.linkedin.com/in/example-eli/,2023,"April 1, 2025"',
      ].join("\n"),
    );
    expect(parsed.problem).toBeNull();
    expect(parsed.ignored).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        fullName: "Dana Whitcombe",
        employer: "Juniper Row Partners",
        title: "Associate",
        industry: "Finance",
        email: "dana@example.com",
        linkedin: "https://www.linkedin.com/in/example-dana/",
        graduationYear: 2024,
        verifiedOn: "2025-04-01",
      },
      {
        fullName: "Eli Marsh",
        linkedin: "https://www.linkedin.com/in/example-eli/",
        graduationYear: 2023,
        verifiedOn: "2025-04-01",
      },
    ]);
  });

  it("reads the same rows copied straight from a spreadsheet, separated by tabs", () => {
    const parsed = parseRows(
      [
        HEADINGS.replaceAll(",", "\t"),
        "Dana Whitcombe\tJuniper Row, LLC\tAssociate\tGovernment \t\t\t2024\t4/1/2025",
        "",
      ].join("\r\n"),
    );
    expect(parsed.rows).toEqual([
      {
        fullName: "Dana Whitcombe",
        employer: "Juniper Row, LLC",
        title: "Associate",
        industry: "Government",
        graduationYear: 2024,
        verifiedOn: "2025-04-01",
      },
    ]);
  });

  it("names columns it does not know, splits lists and assumes the country for a city", () => {
    const parsed = parseRows(
      "Name\tGrad Year\tMajor\tHelp offered\tCity\tState\tShoe size\nDana Whitcombe\t2019\tFinance; Economics\tCareer advice / Resume review\tAustin\tTX\t9",
    );
    expect(parsed.ignored).toEqual(["shoe size"]);
    expect(parsed.rows[0]).toEqual({
      fullName: "Dana Whitcombe",
      graduationYear: 2019,
      majors: ["Finance", "Economics"],
      helpOffered: ["Career advice", "Resume review"],
      city: "Austin",
      region: "TX",
      country: "United States",
    });
  });

  it("keeps a year or date it cannot read as given, so the loader can refuse that row", () => {
    const parsed = parseRows("Name,Grad Year,Date updated\nDana Whitcombe,twenty,last spring");
    expect(parsed.rows[0]).toEqual({
      fullName: "Dana Whitcombe",
      graduationYear: "twenty",
      verifiedOn: "last spring",
    });
  });

  it("asks for the headings when the first row is not headings", () => {
    expect(parseRows("Dana Whitcombe,2019").problem).toContain("column headings");
    expect(parseRows("Company,Role\nJuniper Row,Associate").problem).toContain(
      "Name and Grad year",
    );
  });
});
