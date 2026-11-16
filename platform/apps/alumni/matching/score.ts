// The matching rules: what a student and an alum have in common, and what that is worth.
// Pure functions with no database access and no randomness, so the same data always gives the
// same answer and every rule can be tested on its own. Skills and the career goal are not
// scored: alumni have no skills on record to compare with, and free text cannot be matched
// reliably.
import { WEIGHTS } from "./config";

export interface MatchStudent {
  personId: string;
  industryIds: string[];
  helpKindIds: string[];
  /** Today's program for each major, so a former degree name matches its replacement. */
  majorIds: string[];
  schoolIds: string[];
  locationIds: string[];
}
export interface MatchAlum {
  personId: string;
  currentIndustryId: string | null;
  pastIndustryIds: string[];
  helpKindIds: string[];
  majorIds: string[];
  schoolIds: string[];
  locationId: string | null;
}
/** Display names by ID, used to write the reasons in plain words. */
export interface MatchNames {
  industries: ReadonlyMap<string, string>;
  helpKinds: ReadonlyMap<string, string>;
  majors: ReadonlyMap<string, string>;
  schools: ReadonlyMap<string, string>;
  cities: ReadonlyMap<string, string>;
}
export interface ScoredAlum {
  personId: string;
  score: number;
  /** Why this alum may be a useful connection, most important first. Empty when score is 0. */
  reasons: string[];
}

const shared = (mine: string[], theirs: string[]) =>
  [...new Set(mine)].filter((id) => theirs.includes(id)).sort();
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function scoreAlum(student: MatchStudent, alum: MatchAlum, names: MatchNames): ScoredAlum {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  const name = (list: ReadonlyMap<string, string>, id: string) => list.get(id) ?? id;

  const current = alum.currentIndustryId;
  if (current && student.industryIds.includes(current))
    add(
      WEIGHTS.currentIndustry,
      `Works in ${name(names.industries, current)}, an industry you chose`,
    );
  for (const id of shared(student.industryIds, alum.pastIndustryIds))
    if (id !== current)
      add(
        WEIGHTS.pastIndustry,
        `Used to work in ${name(names.industries, id)}, an industry you chose`,
      );
  for (const id of shared(student.helpKindIds, alum.helpKindIds))
    add(WEIGHTS.help, `Offers ${lowerFirst(name(names.helpKinds, id))}, which you asked for`);
  const majors = shared(student.majorIds, alum.majorIds);
  for (const id of majors) add(WEIGHTS.major, `Studied ${name(names.majors, id)}, like you`);
  if (!majors.length)
    for (const id of shared(student.schoolIds, alum.schoolIds).slice(0, 1))
      add(WEIGHTS.school, `Also studied at ${name(names.schools, id)}`);
  if (alum.locationId && student.locationIds.includes(alum.locationId))
    add(WEIGHTS.city, `Works in ${name(names.cities, alum.locationId)}, a city you chose`);
  return { personId: alum.personId, score, reasons };
}

/**
 * Alumni with at least one thing in common, best first. Ties are broken by person ID, the same
 * way every time. The student is never matched with themself.
 */
export function rankAlumni(
  student: MatchStudent,
  alumni: MatchAlum[],
  names: MatchNames,
): ScoredAlum[] {
  return alumni
    .filter((alum) => alum.personId !== student.personId)
    .map((alum) => scoreAlum(student, alum, names))
    .filter((scored) => scored.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || (a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0),
    );
}
