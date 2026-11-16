// Settings for matching. Change a number here, not in the code that uses it.

/** A student gets a new set of matches once per period. */
export const MATCH_PERIOD_DAYS = 30;
/** How many alumni a student is given in one set. */
export const MATCHES_PER_PERIOD = 3;
/** One alum is given to at most this many students within one period. */
export const ALUM_LIMIT_PER_PERIOD = 3;

/** Points for each thing a student and an alum have in common. More in common scores higher. */
export const WEIGHTS = {
  /** The alum's current job is in an industry the student chose. */
  currentIndustry: 5,
  /** A past job was in an industry the student chose. Counts for less than a current job. */
  pastIndustry: 2,
  /** The alum offers a kind of help the student wants. Counted once per kind. */
  help: 3,
  /** They studied the same major. Counted once per shared major. */
  major: 3,
  /** They studied at the same school, when they share no major. */
  school: 1,
  /** The alum works in a city the student chose. */
  city: 2,
} as const;
