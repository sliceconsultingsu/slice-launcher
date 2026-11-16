// Files the result of reading one alum's experience page. The page is read by a Slice admin's own
// assistant in their own browser; this code only receives what was read, compares it with the
// stored profile and records the result. A profile never changes here: a difference becomes a
// proposal that an admin approves or rejects on the review page.
import { z } from "zod";
import { InvalidChoiceError } from "../data/reads";
import type { AlumniData } from "../data/services";
import { AlumniDataError, jobJson, nameKey } from "../data/store";
import { compareJobs } from "./compare";
import { MIN_GAP_SECONDS, RETRIEVED_MAX_AGE_HOURS, RETRIEVED_MAX_AHEAD_MINUTES } from "./config";
import { listedAlumni } from "./due";

const place = z.string().trim().max(80).nullable();
const currentJobSchema = z.strictObject({
  employerName: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  /** The assistant's suggestion from the fixed list. Used only for an employer not yet known. */
  industryId: z.string().trim().min(1).max(80),
  startMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),
  /** A location is used only when city and country are both given. */
  city: place,
  region: place,
  country: place,
});
export const refreshFileSchema = z.strictObject({
  personId: z.string().min(1).max(100),
  /** Must equal the experience address the app works out for this person. */
  sourceUrl: z.string().min(1).max(500),
  retrievedAt: z.iso.datetime(),
  outcome: z.enum(["read", "unreachable"]),
  /** Only with "unreachable": a short reason such as "sign-in page". Never page text. */
  detail: z.string().trim().min(1).max(200).optional(),
  /** Required with "read": the name in the page title. */
  pageName: z.string().trim().min(1).max(120).optional(),
  /** Required with "read": null means the page shows no role ending in "Present". */
  currentJob: currentJobSchema.nullable().optional(),
});
export type RefreshFileInput = z.input<typeof refreshFileSchema>;

export type RefreshFileResult =
  | { status: "not_found" | "wrong_source" | "unreachable" | "name_mismatch" }
  | { status: "unchanged" | "needs_manual_review" }
  | { status: "too_fast"; retryAfterSeconds: number }
  | { status: "already_pending" | "proposed"; pendingChangeId: string };

export async function refreshFile(
  data: AlumniData,
  input: RefreshFileInput,
): Promise<RefreshFileResult> {
  const parsed = refreshFileSchema.safeParse(input);
  if (!parsed.success) throw new AlumniDataError("invalid", "The filed result is not valid.");
  const filed = parsed.data;
  const now = data.now();
  if (filed.outcome === "read" && (filed.pageName === undefined || filed.currentJob === undefined))
    throw new AlumniDataError("invalid", 'A "read" result needs pageName and currentJob.');
  if (filed.outcome === "read" && filed.detail !== undefined)
    throw new AlumniDataError("invalid", 'Only an "unreachable" result may carry a detail.');
  const readAt = Date.parse(filed.retrievedAt);
  if (
    readAt > Date.parse(now) + RETRIEVED_MAX_AHEAD_MINUTES * 60_000 ||
    readAt < Date.parse(now) - RETRIEVED_MAX_AGE_HOURS * 3_600_000
  )
    throw new AlumniDataError(
      "invalid",
      `retrievedAt must be within the last ${RETRIEVED_MAX_AGE_HOURS} hours.`,
    );

  // 1. Find the alum. They must be listed, not merged away, and have a usable LinkedIn link.
  const [alum] = await listedAlumni(data.db, filed.personId);
  if (!alum?.experienceUrl) return { status: "not_found" };
  const source = alum.experienceUrl;
  // 2. Check the address.
  if (filed.sourceUrl !== source) return { status: "wrong_source" };
  // 3. Check the pace: the app refuses results that arrive faster than the agreed gap.
  const newest = await data.db
    .prepare("SELECT max(checked_at) AS checked_at FROM alumni_refresh_checks")
    .first<{ checked_at: string | null }>();
  if (newest?.checked_at) {
    const elapsed = (Date.parse(now) - Date.parse(newest.checked_at)) / 1000;
    if (elapsed < MIN_GAP_SECONDS)
      return { status: "too_fast", retryAfterSeconds: Math.ceil(MIN_GAP_SECONDS - elapsed) };
  }
  const log = (
    outcome: "proposed" | "unchanged" | "unreachable" | "error" | "skipped",
    detail: string | null,
    pendingChangeId: string | null = null,
  ) =>
    data.store.recordRefreshCheck({
      personId: alum.personId,
      source,
      checkedAt: now,
      outcome,
      detail,
      pendingChangeId,
    });

  // 4. Unreachable.
  if (filed.outcome === "unreachable") {
    await log("unreachable", filed.detail ?? null);
    return { status: "unreachable" };
  }
  // 5. Check the name, so a result read from the wrong person's page is never compared.
  const aliases = (
    await data.db
      .prepare("SELECT name_key FROM alumni_aliases WHERE person_id = ?")
      .bind(alum.personId)
      .all<{ name_key: string }>()
  ).results.map((row) => row.name_key);
  if (![alum.nameKey, ...aliases].includes(nameKey(filed.pageName ?? ""))) {
    await log("error", "name on page does not match");
    return { status: "name_mismatch" };
  }
  // 6. Compare.
  const read = filed.currentJob ?? null;
  if (read) {
    const industries = (
      await data.db
        .prepare("SELECT id, name FROM alumni_industries WHERE active = 1 ORDER BY name")
        .all<{ id: string; name: string }>()
    ).results;
    if (!industries.some((industry) => industry.id === read.industryId))
      throw new InvalidChoiceError("industry", industries);
  }
  const stored = await data.db
    .prepare(
      `SELECT e.name AS employerName, pr.job_title AS title, pr.job_start_month AS startMonth
       FROM alumni_profiles pr JOIN alumni_employers e ON e.id = pr.job_employer_id
       WHERE pr.person_id = ?`,
    )
    .bind(alum.personId)
    .first<{ employerName: string; title: string; startMonth: string | null }>();
  const comparison = compareJobs(stored, read);
  // 7. Unchanged.
  if (comparison.result === "unchanged") {
    await log("unchanged", null);
    return { status: "unchanged" };
  }
  // 8. Needs manual review.
  if (comparison.result === "needs-manual-review" || !read) {
    await log("skipped", "page shows no current role");
    return { status: "needs_manual_review" };
  }
  // 9. Already waiting. Build the proposed value first, so like is compared with like.
  let field: "job_title" | "current_job";
  let proposedValue: string | Parameters<typeof jobJson>[0];
  let proposedText: string | null;
  if (comparison.result === "title-correction") {
    field = "job_title";
    proposedValue = comparison.title;
    proposedText = comparison.title;
  } else {
    const employerId = await data.store.findOrCreateEmployer(read.employerName);
    // An employer already on someone's job keeps the industry most often recorded for it.
    const known = await data.db
      .prepare(
        `SELECT industry, count(*) AS n FROM (
           SELECT job_industry_id AS industry FROM alumni_profiles WHERE job_employer_id = ?
           UNION ALL SELECT industry_id FROM alumni_experiences WHERE employer_id = ?)
         GROUP BY industry ORDER BY n DESC, industry LIMIT 1`,
      )
      .bind(employerId, employerId)
      .first<{ industry: string }>();
    const job = {
      employerId,
      title: read.title,
      industryId: known?.industry ?? read.industryId,
      locationId:
        read.city && read.country
          ? await data.store.findOrCreateLocation(read.city, read.region, read.country)
          : null,
      startMonth: read.startMonth,
    };
    field = "current_job";
    proposedValue = job;
    proposedText = jobJson(job);
  }
  const waiting = await data.db
    .prepare(
      "SELECT id FROM alumni_pending_changes WHERE entity = 'alumni_profile' AND record_id = ? AND field = ? AND proposed_value = ? AND status = 'pending' ORDER BY found_at, id LIMIT 1",
    )
    .bind(alum.personId, field, proposedText)
    .first<{ id: string }>();
  if (waiting) {
    await log("skipped", "same change already waiting for review");
    return { status: "already_pending", pendingChangeId: waiting.id };
  }
  // 10. Propose.
  const pendingChangeId = await data.store.proposeChange({
    entity: "alumni_profile",
    recordId: alum.personId,
    field,
    proposedValue,
    source,
    foundAt: filed.retrievedAt,
  });
  await log("proposed", null, pendingChangeId);
  return { status: "proposed", pendingChangeId };
}
