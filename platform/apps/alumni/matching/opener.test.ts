import { describe, expect, it } from "vitest";
import { firstMessage, talkingPoint } from "./opener";
import { scoreAlum, type MatchNames } from "./score";

const names: MatchNames = {
  industries: new Map([
    ["consulting", "Consulting"],
    ["technology", "Technology"],
  ]),
  helpKinds: new Map([["case-practice", "Case interview practice"]]),
  majors: new Map([["finance", "Finance"]]),
  schools: new Map([["whitman", "Whitman School of Management"]]),
  cities: new Map([["loc-bos", "Boston, MA"]]),
};
const student = {
  personId: "s-1",
  industryIds: ["consulting", "technology"],
  helpKindIds: ["case-practice"],
  majorIds: ["finance"],
  schoolIds: ["whitman"],
  locationIds: ["loc-bos"],
};
const alum = {
  personId: "a-1",
  currentIndustryId: "consulting",
  pastIndustryIds: ["technology"],
  helpKindIds: ["case-practice"],
  majorIds: ["finance"],
  schoolIds: ["whitman"],
  locationId: "loc-bos",
};

describe("a first message for a match", () => {
  it("turns every reason the matching rules can write into something to say", () => {
    const sameMajor = scoreAlum(student, alum, names).reasons;
    const sameSchoolOnly = scoreAlum(student, { ...alum, majorIds: [] }, names).reasons;
    const reasons = [...new Set([...sameMajor, ...sameSchoolOnly])];
    expect(reasons).toHaveLength(6);
    for (const reason of reasons) expect(talkingPoint(reason), reason).not.toBeNull();
  });

  it("uses first names and at most two reasons", () => {
    expect(
      firstMessage({
        studentName: "Riley Chen",
        alumName: "Marcus Bellweather",
        reasons: scoreAlum(student, alum, names).reasons,
      }),
    ).toBe(
      "Hi Marcus, I’m Riley, a member of Slice Consulting at Syracuse University. " +
        "I’m interested in Consulting, where you work, and I’m interested in Technology, where you used to work. " +
        "Would you have 20 minutes for a call sometime this month?",
    );
  });

  it("still reads well with no usable reason and no names", () => {
    expect(talkingPoint("Likes the same films")).toBeNull();
    expect(
      firstMessage({ studentName: " ", alumName: "", reasons: ["Likes the same films"] }),
    ).toBe(
      "Hi there, I’m a member of Slice Consulting at Syracuse University. " +
        "I found you in the Slice alumni network. " +
        "Would you have 20 minutes for a call sometime this month?",
    );
  });
});
