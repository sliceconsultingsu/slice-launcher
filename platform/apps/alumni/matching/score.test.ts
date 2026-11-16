import { describe, expect, it } from "vitest";
import { WEIGHTS } from "./config";
import { rankAlumni, scoreAlum, type MatchAlum, type MatchNames, type MatchStudent } from "./score";

const names: MatchNames = {
  industries: new Map([
    ["consulting", "Consulting"],
    ["financial-services", "Financial Services"],
    ["technology", "Technology"],
  ]),
  helpKinds: new Map([
    ["resume-review", "Resume review"],
    ["career-advice", "Career advice"],
  ]),
  majors: new Map([["finance", "Finance"]]),
  schools: new Map([["whitman", "Martin J. Whitman School of Management"]]),
  cities: new Map([["loc-nyc", "New York, NY"]]),
};
const student: MatchStudent = {
  personId: "student",
  industryIds: ["financial-services"],
  helpKindIds: ["resume-review"],
  majorIds: ["finance"],
  schoolIds: ["whitman"],
  locationIds: ["loc-nyc"],
};
const alum = (personId: string, overrides: Partial<MatchAlum> = {}): MatchAlum => ({
  personId,
  currentIndustryId: null,
  pastIndustryIds: [],
  helpKindIds: [],
  majorIds: [],
  schoolIds: [],
  locationId: null,
  ...overrides,
});

describe("scoring one alum", () => {
  it("explains a match in plain words", () => {
    const scored = scoreAlum(
      student,
      alum("a", {
        currentIndustryId: "financial-services",
        helpKindIds: ["resume-review", "career-advice"],
        majorIds: ["finance"],
        schoolIds: ["whitman"],
        locationId: "loc-nyc",
      }),
      names,
    );
    expect(scored.reasons).toEqual([
      "Works in Financial Services, an industry you chose",
      "Offers resume review, which you asked for",
      "Studied Finance, like you",
      "Works in New York, NY, a city you chose",
    ]);
    expect(scored.score).toBe(
      WEIGHTS.currentIndustry + WEIGHTS.help + WEIGHTS.major + WEIGHTS.city,
    );
  });

  it("counts a current job for more than a past job in the same industry", () => {
    const current = scoreAlum(
      student,
      alum("a", { currentIndustryId: "financial-services" }),
      names,
    );
    const past = scoreAlum(student, alum("b", { pastIndustryIds: ["financial-services"] }), names);
    expect(current.score).toBeGreaterThan(past.score);
    expect(past.reasons).toEqual(["Used to work in Financial Services, an industry you chose"]);
    // An industry is not counted twice when it is both the current and a past job.
    const both = scoreAlum(
      student,
      alum("c", {
        currentIndustryId: "financial-services",
        pastIndustryIds: ["financial-services"],
      }),
      names,
    );
    expect(both.score).toBe(current.score);
  });

  it("mentions a shared school only when they share no major", () => {
    const school = scoreAlum(student, alum("a", { schoolIds: ["whitman"] }), names);
    expect(school.reasons).toEqual(["Also studied at Martin J. Whitman School of Management"]);
    expect(school.score).toBe(WEIGHTS.school);
  });

  it("gives no score and no reason when nothing is in common", () => {
    expect(scoreAlum(student, alum("a", { currentIndustryId: "technology" }), names)).toEqual({
      personId: "a",
      score: 0,
      reasons: [],
    });
  });
});

describe("ranking alumni", () => {
  const pool = [
    alum("city-only", { locationId: "loc-nyc" }),
    alum("industry-and-help", {
      currentIndustryId: "financial-services",
      helpKindIds: ["resume-review"],
    }),
    alum("nothing", { currentIndustryId: "technology" }),
    alum("tech", { currentIndustryId: "technology", helpKindIds: ["career-advice"] }),
  ];

  it("ranks shared industry and help above a shared city, and leaves out nothing-in-common", () => {
    expect(rankAlumni(student, pool, names).map((scored) => scored.personId)).toEqual([
      "industry-and-help",
      "city-only",
    ]);
  });

  it("changes who scores highest when the student's industry changes", () => {
    const changed = { ...student, industryIds: ["technology"], helpKindIds: ["career-advice"] };
    expect(rankAlumni(changed, pool, names)[0]?.personId).toBe("tech");
  });

  it("breaks ties by person ID, the same way every time, whatever the input order", () => {
    const tied = [alum("b", { locationId: "loc-nyc" }), alum("a", { locationId: "loc-nyc" })];
    const order = rankAlumni(student, tied, names).map((scored) => scored.personId);
    expect(order).toEqual(["a", "b"]);
    expect(rankAlumni(student, [...tied].reverse(), names).map((s) => s.personId)).toEqual(order);
  });

  it("never matches a student with themself", () => {
    const self = alum("student", { currentIndustryId: "financial-services" });
    expect(rankAlumni(student, [self], names)).toEqual([]);
  });
});
