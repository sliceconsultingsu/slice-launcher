// Loads alumni from Slice's contact book. An admin pastes rows on the "Add alumni" screen; the
// file itself never enters the repository. Loading the same rows twice adds nobody the second
// time: a person is recognized by name and graduation year, as everywhere else in the app.
import { z } from "zod";
import type { AlumniData } from "./services";
import { AlumniDataError, nameKey, type ContactKind } from "./store";

const text = (max: number) => z.string().trim().max(max).nullable().default(null);
export const importRowSchema = z.strictObject({
  fullName: z.string().trim().min(1).max(120),
  graduationYear: z.number().int().min(1950).max(2100),
  /** Major names or IDs, primary first. A former degree name is accepted. */
  majors: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
  employer: text(120),
  title: text(120),
  /** An industry name or ID from the fixed list. Needed for a new employer. */
  industry: text(80),
  city: text(80),
  region: text(80),
  country: text(80),
  linkedin: text(300),
  email: text(300),
  phone: text(300),
  /** Names or IDs of the kinds of help offered. */
  helpOffered: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
  note: text(2000),
  /** The day the row was last confirmed in the contact book, as YYYY-MM-DD. */
  verifiedOn: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
    .nullable()
    .default(null),
});
export const IMPORT_BATCH_MAX = 25;
export const importSchema = z.strictObject({
  /** The sheet row number of the first row sent, so errors can name the right row. */
  firstRow: z.number().int().min(1).max(100_000).default(1),
  rows: z.array(z.unknown()).min(1).max(IMPORT_BATCH_MAX),
});

export interface ImportReport {
  added: number;
  /** Already in the app; nothing was changed. */
  alreadyThere: number;
  /** Looks like an existing person but could not be confirmed; waiting for an admin. */
  needsReview: number;
  errors: { row: number; name: string; message: string }[];
}

/**
 * Shorter labels a contact book may use for an industry on the fixed list. A label with no
 * counterpart is refused so an admin can choose the right industry.
 */
const INDUSTRY_LABELS: Record<string, string> = {
  finance: "financial-services",
  banking: "financial-services",
  marketing: "marketing-advertising",
  advertising: "marketing-advertising",
  government: "government-public-policy",
  "public policy": "government-public-policy",
  tech: "technology",
  media: "media-entertainment",
  entertainment: "media-entertainment",
  healthcare: "healthcare-life-sciences",
  retail: "consumer-retail",
  nonprofit: "nonprofit-education",
  education: "nonprofit-education",
  energy: "energy-utilities",
  manufacturing: "manufacturing-industrials",
  law: "legal",
  "recruiting hr": "recruiting-hr",
  recruiting: "recruiting-hr",
  hr: "recruiting-hr",
  "human resources": "recruiting-hr",
};

/** What each field is called on the sheet, for messages an admin reads. */
const COLUMN_WORDS: Record<string, string> = {
  fullName: "the name",
  graduationYear: "the graduation year",
  majors: "the majors",
  employer: "the company",
  title: "the role",
  industry: "the industry",
  city: "the city",
  region: "the state",
  country: "the country",
  linkedin: "the LinkedIn link",
  email: "the email",
  phone: "the phone number",
  helpOffered: "the help offered",
  note: "the note",
  verifiedOn: "the date updated",
};

type Named = { id: string; name: string };
const resolve = (value: string, list: Named[]) =>
  list.find((item) => item.id === value || nameKey(item.name) === nameKey(value))?.id ?? null;

export async function importAlumni(
  data: AlumniData,
  input: z.input<typeof importSchema>,
  adminMemberId: string,
): Promise<ImportReport> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) throw new AlumniDataError("invalid", "The rows could not be read.");
  const [majors, industries, helpKinds] = await data.db.batch<Named>([
    data.db.prepare("SELECT id, name FROM alumni_majors"),
    data.db.prepare("SELECT id, name FROM alumni_industries WHERE active = 1 ORDER BY name"),
    data.db.prepare("SELECT id, name FROM alumni_help_kinds WHERE active = 1"),
  ]);
  const report: ImportReport = { added: 0, alreadyThere: 0, needsReview: 0, errors: [] };
  const admin = { type: "admin" as const, memberId: adminMemberId };

  for (const [index, raw] of parsed.data.rows.entries()) {
    const row = parsed.data.firstRow + index;
    const fail = (name: string, message: string) => report.errors.push({ row, name, message });
    const result = importRowSchema.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = String(issue?.path[0] ?? "");
      fail("", `This row could not be read. Check ${COLUMN_WORDS[field] ?? "its values"}.`);
      continue;
    }
    const record = result.data;
    // Check every choice before saving anything, so a refused row leaves nothing behind.
    const majorIds = record.majors.map((major) => resolve(major, majors?.results ?? []));
    const unknownMajor = record.majors[majorIds.indexOf(null)];
    if (unknownMajor !== undefined) {
      fail(record.fullName, `“${unknownMajor}” is not a major on the list.`);
      continue;
    }
    const helpIds = record.helpOffered.map((help) => resolve(help, helpKinds?.results ?? []));
    const unknownHelp = record.helpOffered[helpIds.indexOf(null)];
    if (unknownHelp !== undefined) {
      fail(record.fullName, `“${unknownHelp}” is not a kind of help on the list.`);
      continue;
    }
    if (Boolean(record.employer) !== Boolean(record.title)) {
      fail(record.fullName, "A job needs both an employer and a title.");
      continue;
    }
    let industryId: string | null = null;
    if (record.employer) {
      const listed = industries?.results ?? [];
      if (record.industry)
        industryId =
          resolve(record.industry, listed) ??
          resolve(INDUSTRY_LABELS[nameKey(record.industry)] ?? "", listed);
      // An employer already on someone's job keeps the industry recorded for it.
      industryId ??=
        (
          await data.db
            .prepare(
              `SELECT pr.job_industry_id AS id FROM alumni_profiles pr
               JOIN alumni_employers e ON e.id = pr.job_employer_id
               WHERE e.name_key = ? ORDER BY pr.job_industry_id LIMIT 1`,
            )
            .bind(nameKey(record.employer))
            .first<{ id: string }>()
        )?.id ?? null;
      if (!industryId) {
        fail(
          record.fullName,
          record.industry
            ? `“${record.industry}” is not an industry on the list. Use one of: ${listed.map((item) => item.name).join(", ")}.`
            : "Add an industry for this job. This employer is new to the app.",
        );
        continue;
      }
    }

    if (record.verifiedOn && record.verifiedOn > data.now().slice(0, 10)) {
      fail(record.fullName, "The date updated is in the future.");
      continue;
    }

    const contacts: { kind: ContactKind; value: string }[] = [];
    if (record.email) contacts.push({ kind: "email", value: record.email });
    if (record.linkedin) contacts.push({ kind: "linkedin", value: record.linkedin });
    if (record.phone) contacts.push({ kind: "phone", value: record.phone });
    try {
      const outcome = await data.store.addAlumnus({
        fullName: record.fullName,
        graduationYear: record.graduationYear,
        contacts,
      });
      if (outcome.outcome === "attached") {
        report.alreadyThere++;
        continue;
      }
      if (outcome.outcome === "needs-review") {
        // The same unconfirmed record loaded again must not pile up for the admin. Keep the
        // first pending review of it and drop the repeat. A row with no email or LinkedIn link
        // adds nothing a reviewer could use, so it simply counts as already there.
        const repeat = await data.db
          .prepare(
            `DELETE FROM alumni_merge_candidates WHERE id = ?1 AND (?2 OR EXISTS (
               SELECT 1 FROM alumni_merge_candidates earlier
               WHERE earlier.id <> ?1 AND earlier.person_id = ?3 AND earlier.status = 'pending'
                 AND earlier.incoming_record = (SELECT incoming_record FROM alumni_merge_candidates WHERE id = ?1)))`,
          )
          .bind(outcome.candidateId, record.email || record.linkedin ? 0 : 1, outcome.personId)
          .run();
        if (repeat.meta.changes && !(record.email || record.linkedin)) report.alreadyThere++;
        else report.needsReview++;
        continue;
      }
      const personId = outcome.personId;
      const details = [
        ...majorIds.map((id, position) =>
          data.db
            .prepare(
              "INSERT INTO alumni_person_majors(person_id, major_id, kind, is_primary) VALUES (?, ?, 'major', ?) ON CONFLICT DO NOTHING",
            )
            .bind(personId, id, position === 0 ? 1 : 0),
        ),
        ...helpIds.map((id) =>
          data.db
            .prepare(
              "INSERT INTO alumni_help_offered(person_id, help_kind_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
            )
            .bind(personId, id),
        ),
      ];
      if (details.length) await data.db.batch(details);
      if (record.employer && record.title && industryId)
        await data.store.changeJob(
          personId,
          {
            employerId: await data.store.findOrCreateEmployer(record.employer),
            title: record.title,
            industryId,
            locationId:
              record.city && record.country
                ? await data.store.findOrCreateLocation(record.city, record.region, record.country)
                : null,
          },
          admin,
        );
      if (record.note)
        await data.store.editField(
          { entity: "alumni_profile", recordId: personId, field: "note" },
          record.note,
          admin,
        );
      // The contact book says when the row was last confirmed. Use that date, not today's, so
      // the profile does not look more recently checked than it was.
      if (record.verifiedOn) {
        const confirmed = `${record.verifiedOn}T00:00:00.000Z`;
        await data.db
          .prepare(
            `UPDATE alumni_profiles SET last_verified_at = ?,
               job_last_verified_at = CASE WHEN job_employer_id IS NULL THEN NULL ELSE ? END
             WHERE person_id = ?`,
          )
          .bind(confirmed, confirmed, personId)
          .run();
      }
      report.added++;
    } catch (error) {
      if (!(error instanceof AlumniDataError)) throw error;
      fail(record.fullName, error.message);
    }
  }
  return report;
}
