// Compares the current job stored for an alum with the one read from their experience page.
// A pure function with no database access, so every rule can be tested on its own.
import { nameKey } from "../data/store";

export interface ComparedJob {
  employerName: string;
  title: string;
  /** 'YYYY-MM', or null when not known. */
  startMonth: string | null;
}
export type Comparison =
  | { result: "unchanged" }
  /** The page shows no current role. There is no way yet to propose "no current job". */
  | { result: "needs-manual-review" }
  | { result: "title-correction"; title: string }
  | { result: "new-job" };

/** Titles are equal after trimming, collapsing repeated spaces and lowercasing. */
function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * `stored` is the alum's current job in the database and `read` is the job on the page; null
 * means none. Differences in start month, city or industry alone are ignored.
 */
export function compareJobs(stored: ComparedJob | null, read: ComparedJob | null): Comparison {
  if (!read) return stored ? { result: "needs-manual-review" } : { result: "unchanged" };
  if (!stored) return { result: "new-job" };
  if (nameKey(stored.employerName) !== nameKey(read.employerName)) return { result: "new-job" };
  if (titleKey(stored.title) === titleKey(read.title)) return { result: "unchanged" };
  // Same employer, different title: a later start month means a new role, not a correction.
  if (stored.startMonth && read.startMonth && read.startMonth > stored.startMonth)
    return { result: "new-job" };
  return { result: "title-correction", title: read.title.trim() };
}
