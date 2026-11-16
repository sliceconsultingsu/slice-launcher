// Settings for the alumni refresh. Change a number here, not in the code that uses it.

/** An alum is due if their last successful check is older than this, or they have none. */
export const REFRESH_INTERVAL_DAYS = 120;
/** Alumni returned per request when no limit is given. */
export const RUN_LIMIT_DEFAULT = 50;
/** Largest limit a request may ask for. */
export const RUN_LIMIT_MAX = 100;
/** Shortest allowed time between two filed checks. */
export const MIN_GAP_SECONDS = 10;
/** Month and day from which a graduation year counts as passed. */
export const GRADUATION_CUTOFF = "06-01";
/** Oldest accepted read time. */
export const RETRIEVED_MAX_AGE_HOURS = 24;
/** An alum with any logged check newer than this is not due, whatever its outcome. */
export const RECHECK_AFTER_HOURS = 20;
/** A read time may be this far ahead of the server's clock, to allow for clock differences. */
export const RETRIEVED_MAX_AHEAD_MINUTES = 5;
/** Most alumni reported as not checkable, and most graduates handled, in one request. */
export const LIST_LIMIT = 100;
