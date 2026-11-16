// The signed-in student's matches, as the screens use them.
import type { MatchOutcome, StudentMatch } from "../data/reads";
import type { MyMatches } from "../matching/mine";
import { request } from "./client";

/** The newest set of matches. Earlier sets are history. */
export function currentSet(matches: StudentMatch[]): StudentMatch[] {
  const newest = matches[0]?.round;
  return matches.filter((match) => match.round === newest);
}

/** Matches in the newest set the student has not decided on, whose alum is still listed. */
export const waiting = (matches: StudentMatch[]) =>
  currentSet(matches).filter((match) => match.outcome === null && match.alum !== null);

export const matchWith = (mine: MyMatches | null, alumId: string) =>
  mine?.matches.find((match) => match.alum?.id === alumId) ?? null;

/** Saves what the student decided about one match. Returns the updated matches, or the error. */
export async function saveOutcome(
  mine: MyMatches,
  match: StudentMatch,
  outcome: MatchOutcome | null,
): Promise<{ mine: MyMatches; error: null } | { mine: null; error: string }> {
  const result = await request(`me/matches/${encodeURIComponent(match.id)}/outcome`, {
    method: "POST",
    body: { outcome },
  });
  if (!result.ok) return { mine: null, error: result.error ?? "We couldn’t save that. Try again." };
  return {
    mine: {
      ...mine,
      matches: mine.matches.map((item) => (item.id === match.id ? { ...item, outcome } : item)),
    },
    error: null,
  };
}
