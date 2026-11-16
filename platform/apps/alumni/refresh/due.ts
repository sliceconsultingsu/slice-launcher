// Which alumni are due for a check, and which cannot be checked at all.
import type { AlumniData, AlumniDatabase } from "../data/services";
import {
  LIST_LIMIT,
  MIN_GAP_SECONDS,
  RECHECK_AFTER_HOURS,
  REFRESH_INTERVAL_DAYS,
  RUN_LIMIT_DEFAULT,
} from "./config";
import { experienceUrl } from "./linkedin";

export interface ListedAlum {
  personId: string;
  fullName: string;
  nameKey: string;
  /** The address every check of this alum uses as its source, or null when there is none. */
  experienceUrl: string | null;
  /** Why the alum cannot be checked; null when they can. */
  reason: "no-linkedin-link" | "bad-linkedin-link" | null;
}

/** Who is running the refresh. Decides whether hidden LinkedIn links may be used. */
export interface RefreshCaller {
  /** True only for a member who also holds the admin permission. */
  admin: boolean;
}

/**
 * Every listed alum whose record is not merged away, with the experience address worked out from
 * their LinkedIn contact detail. With several details, the most recently updated usable one wins.
 *
 * Hidden means hidden: a link an admin has hidden is used only when the caller is an admin too.
 * For anyone else holding refresh.run, that alum is reported as having no link, so running the
 * refresh never reveals a hidden detail.
 */
export async function listedAlumni(
  db: AlumniDatabase,
  caller: RefreshCaller,
  personId?: string,
): Promise<ListedAlum[]> {
  const rows = (
    await db
      .prepare(
        `SELECT p.id, p.full_name, p.name_key, c.value
         FROM alumni_profiles pr
         JOIN alumni_people p ON p.id = pr.person_id
         LEFT JOIN alumni_contacts c ON c.person_id = p.id AND c.kind = 'linkedin'
           AND (c.visibility = 'members' OR ?)
         WHERE p.merged_into IS NULL AND pr.listing_status = 'listed' AND (? IS NULL OR p.id = ?)
         ORDER BY p.id, c.updated_at DESC, c.id`,
      )
      .bind(caller.admin ? 1 : 0, personId ?? null, personId ?? null)
      .all<{ id: string; full_name: string; name_key: string; value: string | null }>()
  ).results;
  const alumni = new Map<string, ListedAlum>();
  for (const row of rows) {
    const address = row.value === null ? null : experienceUrl(row.value);
    const known = alumni.get(row.id);
    if (known?.experienceUrl) continue;
    alumni.set(row.id, {
      personId: row.id,
      fullName: row.full_name,
      nameKey: row.name_key,
      experienceUrl: address,
      reason: address ? null : row.value === null ? "no-linkedin-link" : "bad-linkedin-link",
    });
  }
  return [...alumni.values()];
}

/** Plain text order, the same on every machine. */
function order(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function before(now: string, milliseconds: number): string {
  return new Date(Date.parse(now) - milliseconds).toISOString();
}

export async function refreshDue(
  data: AlumniData,
  caller: RefreshCaller,
  input: { limit?: number },
) {
  const limit = input.limit ?? RUN_LIMIT_DEFAULT;
  const now = data.now();
  const alumni = await listedAlumni(data.db, caller);
  const [industries, successes, recent] = await data.db.batch<Record<string, string>>([
    data.db.prepare("SELECT id, name FROM alumni_industries WHERE active = 1 ORDER BY name"),
    data.db.prepare("SELECT person_id, source, last_success_at FROM alumni_refresh_last_success"),
    // Any check in the last few hours, whatever its outcome, keeps an alum off the list, so a
    // failed or skipped check is not handed out again in the same run.
    data.db
      .prepare("SELECT DISTINCT person_id FROM alumni_refresh_checks WHERE checked_at > ?")
      .bind(before(now, RECHECK_AFTER_HOURS * 3_600_000)),
  ]);
  const lastSuccess = new Map(
    (successes?.results ?? []).map((row) => [
      `${row.person_id} ${row.source}`,
      row.last_success_at,
    ]),
  );
  const checkedRecently = new Set((recent?.results ?? []).map((row) => row.person_id));
  const dueBefore = before(now, REFRESH_INTERVAL_DAYS * 86_400_000);
  const due = alumni
    .flatMap((alum) => {
      if (!alum.experienceUrl || checkedRecently.has(alum.personId)) return [];
      const lastCheckedAt = lastSuccess.get(`${alum.personId} ${alum.experienceUrl}`) ?? null;
      if (lastCheckedAt !== null && lastCheckedAt >= dueBefore) return [];
      return [
        {
          personId: alum.personId,
          fullName: alum.fullName,
          experienceUrl: alum.experienceUrl,
          lastCheckedAt,
        },
      ];
    })
    // Never-checked first, then the longest since a successful check, then by ID.
    .sort(
      (a, b) =>
        order(a.lastCheckedAt ?? "", b.lastCheckedAt ?? "") || order(a.personId, b.personId),
    );
  return {
    minGapSeconds: MIN_GAP_SECONDS,
    industries: (industries?.results ?? []).map((row) => ({ id: row.id, name: row.name })),
    due: due.slice(0, limit),
    remaining: Math.max(0, due.length - limit),
    // Nothing is logged for these: there was nothing to check.
    notCheckable: alumni
      .filter((alum) => alum.reason !== null)
      .slice(0, LIST_LIMIT)
      .map((alum) => ({ personId: alum.personId, reason: alum.reason })),
  };
}
