// A student's matches as the Matches screen and the my_matches tool both show them.
import type { StudentMatch } from "../data/reads";
import type { AlumniData } from "../data/services";
import { assignMatches, type MatchingStatus } from "./assign";

export interface MyMatches {
  /** Where the student stands: a new set was given, the next is not due yet, and so on. */
  matching: MatchingStatus;
  /** Every match so far, newest set first. Earlier matches stay visible. */
  matches: StudentMatch[];
}

/** Gives the student their next set if one is due, then returns all their matches. */
export async function myMatches(data: AlumniData, memberId: string): Promise<MyMatches> {
  const matching = await assignMatches(data, memberId);
  return { matching, matches: await data.reads.listMatches(memberId) };
}
