// What the home and network screens say about the alumni as a whole: how many there are, where
// they work, and what changed lately.
//
// Everything here is built from details a member can already see on a listed alum's profile, so
// it tells nobody anything new. A hidden alum, or a record merged into another, is never counted
// or named. Nothing here checks permissions: the caller does that first.
import type { AlumniDatabase } from "./services";

const LISTED_FROM = "FROM alumni_profiles pr JOIN alumni_people p ON p.id = pr.person_id";
const IS_LISTED = "pr.listing_status = 'listed' AND p.merged_into IS NULL";
/** How far back "lately" reaches. */
export const ACTIVITY_DAYS = 180;
export const ACTIVITY_LIMIT = 8;
/** How many names a "joined" entry carries; the rest are only counted. */
const NAMED_JOINERS = 3;

export interface NetworkSummary {
  alumni: number;
  /** Different employers among listed alumni's current jobs. */
  companies: number;
  /** Industries with at least one listed alum, largest first. */
  industries: { id: string; name: string; alumni: number }[];
  /** The employers with the most listed alumni, largest first. */
  employers: { name: string; alumni: number }[];
}
export interface ActivityPerson {
  id: string;
  name: string;
}
export type ActivityItem =
  /** A listed alum's current job changed. `moved` is false for a new title at the same employer. */
  | {
      kind: "job";
      at: string;
      alum: ActivityPerson;
      title: string;
      employer: string;
      moved: boolean;
      /**
       * The job before a move, in words. Null for a new title at the same employer: the earlier
       * title is not shown on the profile, so it is not shown here either.
       */
      before: string | null;
    }
  /** Alumni added on the same day. `alumni` names the first few; `count` is all of them. */
  | { kind: "joined"; at: string; alumni: ActivityPerson[]; count: number }
  /** An alum's kinds of help were updated. `help` is what they offer now. */
  | { kind: "help"; at: string; alum: ActivityPerson; help: string[] };

export async function networkSummary(db: AlumniDatabase): Promise<NetworkSummary> {
  const [totals, industries, employers] = await db.batch<Record<string, string | number>>([
    db.prepare(
      `SELECT count(*) AS alumni, count(DISTINCT pr.job_employer_id) AS companies ${LISTED_FROM} WHERE ${IS_LISTED}`,
    ),
    db.prepare(
      `SELECT i.id, i.name, count(*) AS n ${LISTED_FROM}
       JOIN alumni_industries i ON i.id = pr.job_industry_id
       WHERE ${IS_LISTED} GROUP BY i.id ORDER BY n DESC, i.name`,
    ),
    db.prepare(
      `SELECT e.name, count(*) AS n ${LISTED_FROM}
       JOIN alumni_employers e ON e.id = pr.job_employer_id
       WHERE ${IS_LISTED} GROUP BY e.id ORDER BY n DESC, e.name LIMIT 5`,
    ),
  ]);
  return {
    alumni: Number(totals?.results[0]?.alumni ?? 0),
    companies: Number(totals?.results[0]?.companies ?? 0),
    industries: (industries?.results ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      alumni: Number(row.n),
    })),
    employers: (employers?.results ?? []).map((row) => ({
      name: String(row.name),
      alumni: Number(row.n),
    })),
  };
}

/** What changed among listed alumni in the last ACTIVITY_DAYS, newest first. */
export async function recentActivity(
  db: AlumniDatabase,
  now: string,
  limit = ACTIVITY_LIMIT,
): Promise<ActivityItem[]> {
  const since = new Date(Date.parse(now) - ACTIVITY_DAYS * 86_400_000).toISOString();
  const [jobs, helped, joined] = await db.batch<Record<string, string | null>>([
    // Each alum's latest job change, described by the job on their profile today. The first job
    // ever recorded (no earlier value) is not a change, so it is left out.
    db
      .prepare(
        `SELECT h.record_id AS id, p.full_name AS name, h.changed_at AS at, h.field,
           pr.job_title AS title, e.name AS employer,
           CASE WHEN h.field = 'current_job' AND json_valid(h.old_value)
                THEN json_extract(h.old_value, '$.title') END AS old_title,
           (SELECT o.name FROM alumni_employers o WHERE o.id =
             CASE WHEN h.field = 'current_job' AND json_valid(h.old_value)
                  THEN json_extract(h.old_value, '$.employerId') END) AS old_employer
         FROM alumni_change_history h
         JOIN alumni_profiles pr ON pr.person_id = h.record_id
         JOIN alumni_people p ON p.id = pr.person_id
         JOIN alumni_employers e ON e.id = pr.job_employer_id
         WHERE h.entity = 'alumni_profile' AND h.field IN ('current_job', 'job_title')
           AND h.old_value IS NOT NULL AND h.changed_at >= ? AND ${IS_LISTED}
           AND h.changed_at = (
             SELECT max(x.changed_at) FROM alumni_change_history x
             WHERE x.entity = 'alumni_profile' AND x.record_id = h.record_id
               AND x.field IN ('current_job', 'job_title'))
         ORDER BY h.changed_at DESC, h.id LIMIT ?`,
      )
      .bind(since, limit),
    db
      .prepare(
        `SELECT h.record_id AS id, p.full_name AS name, max(h.changed_at) AS at
         FROM alumni_change_history h
         JOIN alumni_profiles pr ON pr.person_id = h.record_id
         JOIN alumni_people p ON p.id = pr.person_id
         WHERE h.entity = 'alumni_profile' AND h.field = 'help_offered'
           AND h.changed_at >= ? AND ${IS_LISTED}
         GROUP BY h.record_id ORDER BY at DESC, h.record_id LIMIT ?`,
      )
      .bind(since, limit),
    db
      .prepare(
        `SELECT p.id, p.full_name AS name, pr.created_at AS at ${LISTED_FROM}
         WHERE ${IS_LISTED} AND pr.created_at >= ? ORDER BY pr.created_at DESC, p.name_key LIMIT 500`,
      )
      .bind(since),
  ]);
  const person = (row: Record<string, string | null>): ActivityPerson => ({
    id: row.id ?? "",
    name: row.name ?? "",
  });
  const items: ActivityItem[] = (jobs?.results ?? []).map((row) => ({
    kind: "job",
    at: row.at ?? "",
    alum: person(row),
    title: row.title ?? "",
    employer: row.employer ?? "",
    moved: row.field === "current_job",
    before: row.old_title
      ? row.old_employer
        ? `${row.old_title} at ${row.old_employer}`
        : row.old_title
      : null,
  }));

  const helpers = helped?.results ?? [];
  if (helpers.length) {
    const kinds = (
      await db
        .prepare(
          `SELECT ho.person_id, k.name FROM alumni_help_offered ho
           JOIN alumni_help_kinds k ON k.id = ho.help_kind_id
           WHERE ho.person_id IN (${helpers.map(() => "?").join(", ")}) ORDER BY k.name`,
        )
        .bind(...helpers.map((row) => row.id))
        .all<{ person_id: string; name: string }>()
    ).results;
    for (const row of helpers) {
      const help = kinds.filter((kind) => kind.person_id === row.id).map((kind) => kind.name);
      // Someone who stopped offering help is not news for students.
      if (help.length) items.push({ kind: "help", at: row.at ?? "", alum: person(row), help });
    }
  }

  // Alumni added on the same day are one entry, so loading a whole sheet does not fill the list.
  const days = new Map<string, Record<string, string | null>[]>();
  for (const row of joined?.results ?? []) {
    const day = (row.at ?? "").slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), row]);
  }
  for (const rows of days.values())
    items.push({
      kind: "joined",
      at: rows[0]?.at ?? "",
      alumni: rows.slice(0, NAMED_JOINERS).map(person),
      count: rows.length,
    });

  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
