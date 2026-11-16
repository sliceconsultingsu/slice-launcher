// Gives a student their next set of matches when one is due.
//
// The platform cannot run tasks on a timer, so nothing happens on a schedule by itself. A
// student's next set is worked out when they open their matches, or when their assistant asks,
// and a full period has passed since their last set. Asking again sooner changes nothing.
import type { AlumniData } from "../data/services";
import { ALUM_LIMIT_PER_PERIOD, MATCHES_PER_PERIOD, MATCH_PERIOD_DAYS } from "./config";
import { rankAlumni, type MatchAlum, type MatchNames } from "./score";

const PERIOD_MS = MATCH_PERIOD_DAYS * 86_400_000;

export type MatchingStatus =
  /** A new set was just given. */
  | { status: "matched"; newMatches: number; nextAt: string }
  /** The period since the last set has not passed yet. */
  | { status: "not-due"; nextAt: string }
  /** The student has not saved a profile, or it lacks a major, an industry or a kind of help. */
  | { status: "profile-needed" }
  /** The student has already been given every alum who can be matched. */
  | { status: "nobody-left" }
  /** Alumni remain, but none shares anything with the student's answers right now. */
  | { status: "nothing-in-common" };

export async function assignMatches(data: AlumniData, memberId: string): Promise<MatchingStatus> {
  const profile = await data.reads.getStudentProfile(memberId);
  if (!profile?.complete) return { status: "profile-needed" };
  const now = data.now();
  const student = profile.personId;
  const last = await data.db
    .prepare(
      "SELECT max(round) AS round, max(matched_at) AS matched_at FROM alumni_matches WHERE student_id = ?",
    )
    .bind(student)
    .first<{ round: number | null; matched_at: string | null }>();
  const nextAfter = (matchedAt: string) =>
    new Date(Date.parse(matchedAt) + PERIOD_MS).toISOString();
  if (last?.matched_at && Date.parse(now) < Date.parse(last.matched_at) + PERIOD_MS)
    return { status: "not-due", nextAt: nextAfter(last.matched_at) };

  const [candidates, past, help, studies, recent, own] = await data.db.batch<
    Record<string, string | number | null>
  >([
    // Only people who can be matched: listed, not merged away, not the student, not given before.
    data.db
      .prepare(
        `SELECT pr.person_id, pr.job_industry_id, pr.job_location_id
         FROM alumni_profiles pr JOIN alumni_people p ON p.id = pr.person_id
         WHERE p.merged_into IS NULL AND pr.listing_status = 'listed' AND pr.person_id <> ?
           AND NOT EXISTS (SELECT 1 FROM alumni_matches m WHERE m.student_id = ? AND m.alum_id = pr.person_id)`,
      )
      .bind(student, student),
    data.db.prepare("SELECT person_id, industry_id AS id FROM alumni_experiences"),
    data.db.prepare("SELECT person_id, help_kind_id AS id FROM alumni_help_offered"),
    data.db.prepare(
      "SELECT person_id, current_major_id, school_id FROM alumni_person_schools WHERE kind = 'major'",
    ),
    // Sharing alumni fairly: how many students each alum was given to within the last period.
    data.db
      .prepare(
        "SELECT alum_id AS person_id, count(*) AS n FROM alumni_matches WHERE matched_at > ? GROUP BY alum_id",
      )
      .bind(new Date(Date.parse(now) - PERIOD_MS).toISOString()),
    data.db
      .prepare(
        "SELECT current_major_id, school_id FROM alumni_person_schools WHERE kind = 'major' AND person_id = ?",
      )
      .bind(student),
  ]);
  const eligible = candidates?.results ?? [];
  if (!eligible.length) return { status: "nobody-left" };

  const text = (value: string | number | null | undefined) => (value == null ? "" : String(value));
  const byPerson = (rows: Record<string, string | number | null>[] | undefined, column: string) => {
    const map = new Map<string, string[]>();
    for (const row of rows ?? []) {
      const list = map.get(text(row.person_id)) ?? [];
      list.push(text(row[column]));
      map.set(text(row.person_id), list);
    }
    return map;
  };
  const pastIndustries = byPerson(past?.results, "id");
  const helpOffered = byPerson(help?.results, "id");
  const majors = byPerson(studies?.results, "current_major_id");
  const schools = byPerson(studies?.results, "school_id");
  const givenRecently = new Map(
    (recent?.results ?? []).map((row) => [text(row.person_id), Number(row.n)]),
  );
  const alumni: MatchAlum[] = eligible
    .filter((row) => (givenRecently.get(text(row.person_id)) ?? 0) < ALUM_LIMIT_PER_PERIOD)
    .map((row) => ({
      personId: text(row.person_id),
      currentIndustryId: row.job_industry_id == null ? null : text(row.job_industry_id),
      pastIndustryIds: pastIndustries.get(text(row.person_id)) ?? [],
      helpKindIds: helpOffered.get(text(row.person_id)) ?? [],
      majorIds: majors.get(text(row.person_id)) ?? [],
      schoolIds: schools.get(text(row.person_id)) ?? [],
      locationId: row.job_location_id == null ? null : text(row.job_location_id),
    }));

  const lists = await data.reads.lists();
  const named = (choices: { id: string; name: string }[]) =>
    new Map(choices.map((choice) => [choice.id, choice.name]));
  const names: MatchNames = {
    industries: named(lists.industries),
    helpKinds: named(lists.helpKinds),
    majors: named(lists.majors),
    schools: named(lists.schools),
    cities: named(lists.cities),
  };
  const chosen = rankAlumni(
    {
      personId: student,
      industryIds: profile.industryIds,
      helpKindIds: profile.helpKindIds,
      majorIds: (own?.results ?? []).map((row) => text(row.current_major_id)),
      schoolIds: (own?.results ?? []).map((row) => text(row.school_id)),
      locationIds: profile.locationIds,
    },
    alumni,
    names,
  ).slice(0, MATCHES_PER_PERIOD);
  // Nobody is invented: with nothing in common there is no match, and the app says so.
  if (!chosen.length) return { status: "nothing-in-common" };

  const round = (last?.round ?? 0) + 1;
  try {
    await data.db.batch(
      chosen.map((match, index) =>
        data.db
          .prepare(
            "INSERT INTO alumni_matches(id, student_id, alum_id, round, slot, matched_at, score, reasons) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            data.newId(),
            student,
            match.personId,
            round,
            index + 1,
            now,
            match.score,
            JSON.stringify(match.reasons),
          ),
      ),
    );
  } catch (error) {
    // Another request for the same student saved this set first. Theirs stands; nothing is added.
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed: alumni_matches")
    )
      return { status: "not-due", nextAt: nextAfter(now) };
    throw error;
  }
  return { status: "matched", newMatches: chosen.length, nextAt: nextAfter(now) };
}
