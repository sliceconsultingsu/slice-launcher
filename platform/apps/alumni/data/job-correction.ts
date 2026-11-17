// Correcting a mistake in an alum's current job, such as a company and role entered in each
// other's columns or the wrong industry. This is for a record that was wrong, not for an alum
// who changed jobs: a new job goes through Record a reply or Review, which move the old one to
// past jobs. Nothing here checks permissions: the route does that first.
import { z } from "zod";
import { InvalidChoiceError, type Choice } from "./reads";
import type { AlumniData } from "./services";
import { AlumniDataError } from "./store";

export const jobCorrectionSchema = z.strictObject({
  employer: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  /** An industry ID from the active list. */
  industryId: z.string().trim().min(1).max(80),
});
export type JobCorrection = z.input<typeof jobCorrectionSchema>;

export async function correctJob(
  data: AlumniData,
  adminMemberId: string,
  personId: string,
  input: JobCorrection,
): Promise<"corrected" | "unchanged"> {
  const parsed = jobCorrectionSchema.safeParse(input);
  if (!parsed.success)
    throw new AlumniDataError("invalid", "A job needs a company, a role and an industry.");
  const correction = parsed.data;

  // Check everything before saving anything, so a refused correction leaves nothing behind.
  const alum = await data.db
    .prepare(
      `SELECT pr.job_employer_id FROM alumni_profiles pr JOIN alumni_people p ON p.id = pr.person_id
       WHERE pr.person_id = ? AND p.merged_into IS NULL`,
    )
    .bind(personId)
    .first<{ job_employer_id: string | null }>();
  if (!alum) throw new AlumniDataError("not-found", "No such alumni profile.");
  const industries = (
    await data.db
      .prepare("SELECT id, name FROM alumni_industries WHERE active = 1 ORDER BY name")
      .all<Choice>()
  ).results;
  if (!industries.some((industry) => industry.id === correction.industryId))
    throw new InvalidChoiceError("industry", industries);
  if (!alum.job_employer_id)
    throw new AlumniDataError(
      "invalid",
      "This alum has no current job to correct. Record their reply to add one.",
    );

  return data.store.correctJob(
    personId,
    {
      employerId: await data.store.findOrCreateEmployer(correction.employer),
      title: correction.title,
      industryId: correction.industryId,
    },
    { type: "admin", memberId: adminMemberId },
  );
}
