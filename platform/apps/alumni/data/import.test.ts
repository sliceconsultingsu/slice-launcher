import { describe, expect, it } from "vitest";
import { alumniApi } from "../api";
import { count, useAlumniData } from "../tests/database";
import { apiAs } from "../tests/members";
import { importAlumni } from "./import";

const t = useAlumniData();
const api = apiAs((props) => alumniApi(props, () => t.data));
const ADMIN = "member-example-admin";
const member = { memberId: "member-example-01", admin: false };
const rows = [
  {
    fullName: "Dana Whitcombe",
    graduationYear: 2019,
    majors: ["Finance", "economics"],
    employer: "Juniper Row Partners",
    title: "Associate",
    industry: "Financial Services",
    city: "Austin",
    region: "TX",
    country: "United States",
    linkedin: "https://www.linkedin.com/in/example-dana-whitcombe",
    email: "dana.whitcombe@example.com",
    helpOffered: ["Career advice"],
    note: "Happy to talk about private equity.",
  },
  // No contact details at all, and a former degree name.
  { fullName: "Eli Marsh", graduationYear: 2012, majors: ["Applied Data Analytics"] },
  // A known employer needs no industry.
  {
    fullName: "Farah Idris",
    graduationYear: 2021,
    employer: "bluestone advisory group",
    title: "Analyst",
  },
];

describe("loading the alumni contact book", () => {
  it("adds each person with their major, job, contact details and help offered", async () => {
    const report = await importAlumni(t.data, { firstRow: 2, rows }, ADMIN);
    expect(report).toEqual({ added: 3, alreadyThere: 0, needsReview: 0, errors: [] });
    const page = await t.data.reads.searchAlumni(member, { q: "Dana Whitcombe" });
    const dana = await t.data.reads.getAlum(member, page.results[0]?.id ?? "");
    expect(dana).toMatchObject({
      name: "Dana Whitcombe",
      graduationYear: 2019,
      majors: ["Finance", "Economics"],
      title: "Associate",
      employer: "Juniper Row Partners",
      industry: "Financial Services",
      city: "Austin, TX",
      helpOffered: ["Career advice"],
      note: "Happy to talk about private equity.",
    });
    // No consent step: details from the contact book are visible to members.
    expect(dana?.contacts.map((contact) => contact.kind)).toEqual(["email", "linkedin"]);
    const farah = await t.data.reads.searchAlumni(member, { q: "Farah Idris" });
    expect(farah.results[0]).toMatchObject({
      industry: "Consulting",
      employer: "Bluestone Advisory Group",
    });
    const eli = await t.data.reads.searchAlumni(member, { q: "Eli Marsh" });
    expect(eli.results[0]?.majors).toEqual(["Applied Data Analytics"]);
  });

  it("adds nobody the second time the same rows are loaded", async () => {
    await importAlumni(t.data, { rows }, ADMIN);
    const before = [
      await count(t.db, "alumni_people"),
      await count(t.db, "alumni_contacts"),
      await count(t.db, "alumni_experiences"),
      await count(t.db, "alumni_merge_candidates"),
    ];
    for (let repeat = 0; repeat < 2; repeat++)
      expect(await importAlumni(t.data, { rows }, ADMIN)).toEqual({
        added: 0,
        alreadyThere: 3,
        needsReview: 0,
        errors: [],
      });
    expect([
      await count(t.db, "alumni_people"),
      await count(t.db, "alumni_contacts"),
      await count(t.db, "alumni_experiences"),
      await count(t.db, "alumni_merge_candidates"),
    ]).toEqual(before);
  });

  it("sends a same-name record with a different email to an admin once, not on every load", async () => {
    // Jordan Avery, class of 2015, is in the seed with another email address.
    const clash = [
      { fullName: "Jordan Avery", graduationYear: 2015, email: "someone.else@example.com" },
    ];
    const candidates = await count(t.db, "alumni_merge_candidates");
    const people = await count(t.db, "alumni_people");
    expect(await importAlumni(t.data, { rows: clash }, ADMIN)).toMatchObject({ needsReview: 1 });
    expect(await importAlumni(t.data, { rows: clash }, ADMIN)).toMatchObject({ needsReview: 1 });
    expect(await count(t.db, "alumni_merge_candidates")).toBe(candidates + 1);
    expect(await count(t.db, "alumni_people")).toBe(people);
  });

  it("refuses a row with an unknown choice, names the row, and still loads the others", async () => {
    const people = await count(t.db, "alumni_people");
    const report = await importAlumni(
      t.data,
      {
        firstRow: 10,
        rows: [
          { fullName: "Gus Unknown", graduationYear: 2018, majors: ["Underwater Basket Weaving"] },
          {
            fullName: "Hal Jobless",
            graduationYear: 2018,
            employer: "Brand New Co",
            title: "Lead",
          },
          { fullName: "Ida Half", graduationYear: 2018, title: "Lead" },
          { fullName: "", graduationYear: 2018 },
          { fullName: "Jo Fine", graduationYear: 2018, majors: ["finance"] },
        ],
      },
      ADMIN,
    );
    expect(report.added).toBe(1);
    expect(report.errors).toEqual([
      {
        row: 10,
        name: "Gus Unknown",
        message: "“Underwater Basket Weaving” is not a major on the list.",
      },
      {
        row: 11,
        name: "Hal Jobless",
        message: "Add an industry for this job. This employer is new to the app.",
      },
      { row: 12, name: "Ida Half", message: "A job needs both an employer and a title." },
      { row: 13, name: "", message: "This row could not be read: fullName is not valid." },
    ]);
    expect(await count(t.db, "alumni_people")).toBe(people + 1);
    expect(await count(t.db, "alumni_employers WHERE name = 'Brand New Co'")).toBe(0);
  });

  it("is open to admins only, in batches the platform's request limit allows", async () => {
    expect((await api(ADMIN, "POST", "import", { rows: [rows[1]] })).body).toMatchObject({
      added: 1,
    });
    for (const who of [
      "member-example-01",
      "member-example-runner",
      "member-example-suspended",
    ] as const)
      expect((await api(who, "POST", "import", { rows })).status).toBe(403);
    const tooMany = Array.from({ length: 26 }, () => rows[1]);
    expect((await api(ADMIN, "POST", "import", { rows: tooMany })).status).toBe(400);
    expect((await api(ADMIN, "GET", "import")).status).toBe(405);
  });
});
