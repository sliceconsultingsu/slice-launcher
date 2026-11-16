import { describe, expect, it } from "vitest";
import type { StudentAnswers } from "../data/students";
import { count, loadSeed, useAlumniData } from "../tests/database";
import { assignMatches } from "./assign";
import { ALUM_LIMIT_PER_PERIOD, MATCHES_PER_PERIOD, MATCH_PERIOD_DAYS } from "./config";

const t = useAlumniData();
const RILEY = "member-example-01"; // p-s01: consulting and financial services, New York and Boston
const PERIOD = MATCH_PERIOD_DAYS * 86_400;
const matchesOf = (memberId: string) => t.data.reads.listMatches(memberId);
const alumOf = async (memberId: string) =>
  (await matchesOf(memberId)).map((match) => match.alum?.id ?? "no longer listed");
const consulting: StudentAnswers = {
  graduationYear: 2029,
  majorIds: ["finance"],
  industryIds: ["consulting"],
  helpKindIds: ["case-interview-practice"],
  locationIds: ["loc-bos"],
};

describe("giving a student their matches", () => {
  it("gives a first set straight away, each with at least one reason", async () => {
    const result = await assignMatches(t.data, RILEY);
    expect(result).toMatchObject({ status: "matched", newMatches: MATCHES_PER_PERIOD });
    const matches = await matchesOf(RILEY);
    expect(matches).toHaveLength(MATCHES_PER_PERIOD);
    for (const match of matches) {
      expect(match.round).toBe(1);
      expect(match.reasons.length).toBeGreaterThan(0);
      expect(match.alum).not.toBeNull();
    }
    // Riley chose financial services and consulting; the best match works in one of them.
    expect(matches[0]?.reasons[0]).toMatch(/^Works in (Financial Services|Consulting)/);
  });

  it("does not give a second set before the period has passed", async () => {
    await assignMatches(t.data, RILEY);
    t.advance(PERIOD - 1);
    const early = await assignMatches(t.data, RILEY);
    expect(early.status).toBe("not-due");
    expect(await matchesOf(RILEY)).toHaveLength(MATCHES_PER_PERIOD);
    t.advance(1);
    expect((await assignMatches(t.data, RILEY)).status).toBe("matched");
    const matches = await matchesOf(RILEY);
    expect(matches).toHaveLength(2 * MATCHES_PER_PERIOD);
    // Earlier matches stay visible, after the newer set.
    expect(matches.map((match) => match.round)).toEqual([2, 2, 2, 1, 1, 1]);
  });

  it("never gives the same alum twice, and says so when nobody is left", async () => {
    const given: string[] = [];
    let status = "";
    for (let period = 0; period < 12 && status !== "nobody-left"; period++) {
      status = (await assignMatches(t.data, RILEY)).status;
      t.advance(PERIOD);
    }
    given.push(...(await alumOf(RILEY)));
    expect(given.length).toBeGreaterThanOrEqual(10);
    expect(new Set(given).size).toBe(given.length);
    // Hide everyone Riley has not been given, so no eligible alum remains.
    await t.db
      .prepare(
        "UPDATE alumni_profiles SET listing_status = 'hidden' WHERE person_id NOT IN (SELECT alum_id FROM alumni_matches)",
      )
      .run();
    const rows = await count(t.db, "alumni_matches");
    expect(await assignMatches(t.data, RILEY)).toEqual({ status: "nobody-left" });
    expect(await count(t.db, "alumni_matches")).toBe(rows);
  });

  it("says so, instead of inventing a match, when nobody has anything in common", async () => {
    // Leave one listed alum, who shares nothing with this student's answers.
    await t.db
      .prepare("UPDATE alumni_profiles SET listing_status = 'hidden' WHERE person_id <> 'p-a24'")
      .run();
    await t.data.students.saveProfile(
      { id: "member-example-new", name: "Morgan Example" },
      { ...consulting, majorIds: ["policy-studies"], locationIds: [] },
    );
    expect(await assignMatches(t.data, "member-example-new")).toEqual({
      status: "nothing-in-common",
    });
    expect(await matchesOf("member-example-new")).toEqual([]);
  });

  it("never gives a hidden alum, a merged record or the student themself", async () => {
    // member-example-22 is the alum Jordan Avery (p-a01); as a student they keep that one record.
    const saved = await t.data.students.saveProfile(
      { id: "member-example-22", name: "Jordan Avery" },
      { ...consulting, industryIds: ["financial-services", "consulting"] },
    );
    expect(saved.personId).toBe("p-a01");
    const given: string[] = [];
    for (let period = 0; period < 12; period++) {
      await assignMatches(t.data, "member-example-22");
      t.advance(PERIOD);
    }
    given.push(...(await alumOf("member-example-22")));
    expect(given.length).toBeGreaterThan(MATCHES_PER_PERIOD);
    expect(given).not.toContain("p-a01"); // themself
    expect(given).not.toContain("p-a18"); // hidden
    expect(given).not.toContain("p-a28"); // merged
    expect(given).not.toContain("no longer listed");
  });

  it("shares an alum fairly: once at the limit, the next student gets their next-best", async () => {
    const members = ["one", "two", "three", "four"].map((n) => `member-example-fair-${n}`);
    for (const [index, id] of members.entries())
      await t.data.students.saveProfile({ id, name: `Fair Student ${index + 1}` }, consulting);
    const top: string[] = [];
    for (const id of members) {
      await assignMatches(t.data, id);
      top.push((await matchesOf(id))[0]?.alum?.id ?? "");
    }
    expect(ALUM_LIMIT_PER_PERIOD).toBe(3);
    expect(new Set(top.slice(0, 3)).size).toBe(1);
    expect(top[3]).not.toBe(top[0]);
    expect(await alumOf(members[3] ?? "")).not.toContain(top[0]);
    // A period later the limit no longer holds that alum back.
    t.advance(PERIOD);
    await assignMatches(t.data, members[3] ?? "");
    expect(await alumOf(members[3] ?? "")).toContain(top[0]);
  });

  it("gives the same answer for the same data", async () => {
    await assignMatches(t.data, RILEY);
    const first = (await matchesOf(RILEY)).map((match) => [match.alum?.id, match.reasons]);
    await loadSeed(t.db);
    await assignMatches(t.data, RILEY);
    expect((await matchesOf(RILEY)).map((match) => [match.alum?.id, match.reasons])).toEqual(first);
  });

  it("uses changed answers for the next set and leaves earlier matches alone", async () => {
    await assignMatches(t.data, RILEY);
    const earlier = (await matchesOf(RILEY)).map((match) => [match.id, match.reasons]);
    await t.data.students.saveProfile(
      { id: RILEY, name: "Riley Chen" },
      {
        graduationYear: 2027,
        majorIds: ["computer-science"],
        industryIds: ["technology"],
        helpKindIds: ["resume-review"],
        locationIds: ["loc-sf"],
      },
    );
    expect((await matchesOf(RILEY)).map((match) => [match.id, match.reasons])).toEqual(earlier);
    t.advance(PERIOD);
    await assignMatches(t.data, RILEY);
    const next = (await matchesOf(RILEY)).filter((match) => match.round === 2);
    expect(next).toHaveLength(MATCHES_PER_PERIOD);
    expect(next[0]?.reasons.join(" ")).toMatch(
      /Technology|Computer Science|resume review|San Francisco/,
    );
    expect(
      (await matchesOf(RILEY)).slice(MATCHES_PER_PERIOD).map((m) => [m.id, m.reasons]),
    ).toEqual(earlier);
  });

  it("asks for a profile first, and saves one set when two requests arrive together", async () => {
    expect(await assignMatches(t.data, "member-example-unknown")).toEqual({
      status: "profile-needed",
    });
    const both = await Promise.all([assignMatches(t.data, RILEY), assignMatches(t.data, RILEY)]);
    expect(both.map((result) => result.status).sort()).toEqual(["matched", "not-due"]);
    expect(await matchesOf(RILEY)).toHaveLength(MATCHES_PER_PERIOD);
  });
});
