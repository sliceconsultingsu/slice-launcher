// Recording an alum's reply. Alumni answer the confirmation email in their own words, and the
// reply reaches the admin who sent it. That admin reads it and enters the changes here. Each
// change is applied through the same operations as any other edit, with history.
import { z } from "zod";
import { InvalidChoiceError, type Choice } from "../data/reads";
import type { AlumniData } from "../data/services";
import { AlumniDataError, nameKey } from "../data/store";

const text = (max: number) => z.string().trim().max(max).nullable().default(null);
const id = z.string().trim().min(1).max(100);
export const replySchema = z.strictObject({
  /** The current job as the alum gave it. Leave all three empty to keep the job on file. */
  employer: text(120),
  title: text(120),
  industryId: text(80),
  /** Each contact detail already on file, and whether the alum is happy to share it. */
  contacts: z
    .array(z.strictObject({ id, share: z.boolean() }))
    .max(20)
    .default([]),
  /** Contact details the alum gave that were not on file. They are shared with members. */
  newContacts: z
    .array(
      z.strictObject({
        kind: z.enum(["email", "phone", "linkedin", "other"]),
        value: z.string().trim().min(1).max(300),
      }),
    )
    .max(4)
    .default([]),
  helpKindIds: z.array(id).max(6).default([]),
  note: text(2000),
  /** False when the alum asked not to be listed. */
  listed: z.boolean().default(true),
});
export type ReplyInput = z.input<typeof replySchema>;

export interface ReplyForm {
  personId: string;
  name: string;
  employer: string | null;
  title: string | null;
  industryId: string | null;
  helpKindIds: string[];
  note: string | null;
  listed: boolean;
  contacts: { id: string; kind: string; value: string; shared: boolean }[];
}

/** What the admin's form starts from. Admins only: it includes hidden details. */
export async function replyForm(data: AlumniData, personId: string): Promise<ReplyForm | null> {
  const profile = await data.db
    .prepare(
      `SELECT p.full_name, e.name AS employer, pr.job_title, pr.job_industry_id, pr.note, pr.listing_status
       FROM alumni_profiles pr
       JOIN alumni_people p ON p.id = pr.person_id
       LEFT JOIN alumni_employers e ON e.id = pr.job_employer_id
       WHERE pr.person_id = ? AND p.merged_into IS NULL`,
    )
    .bind(personId)
    .first<{
      full_name: string;
      employer: string | null;
      job_title: string | null;
      job_industry_id: string | null;
      note: string | null;
      listing_status: string;
    }>();
  if (!profile) return null;
  const [help, contacts] = await data.db.batch<Record<string, string>>([
    data.db
      .prepare(
        "SELECT help_kind_id AS id FROM alumni_help_offered WHERE person_id = ? ORDER BY help_kind_id",
      )
      .bind(personId),
    data.db
      .prepare(
        "SELECT id, kind, value, visibility FROM alumni_contacts WHERE person_id = ? ORDER BY kind, value",
      )
      .bind(personId),
  ]);
  return {
    personId,
    name: profile.full_name,
    employer: profile.employer,
    title: profile.job_title,
    industryId: profile.job_industry_id,
    helpKindIds: (help?.results ?? []).map((row) => row.id ?? ""),
    note: profile.note,
    listed: profile.listing_status === "listed",
    contacts: (contacts?.results ?? []).map((row) => ({
      id: row.id ?? "",
      kind: row.kind ?? "",
      value: row.value ?? "",
      shared: row.visibility === "members",
    })),
  };
}

export async function recordReply(
  data: AlumniData,
  adminMemberId: string,
  personId: string,
  input: ReplyInput,
): Promise<void> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success)
    throw new AlumniDataError("invalid", "The reply could not be saved as entered.");
  const reply = parsed.data;
  const current = await replyForm(data, personId);
  if (!current) throw new AlumniDataError("not-found", "No such alumni profile.");
  const admin = { type: "admin" as const, memberId: adminMemberId };

  // Check everything first, so a refused reply changes nothing.
  const jobGiven = [reply.employer, reply.title, reply.industryId].filter(Boolean).length;
  if (jobGiven !== 0 && jobGiven !== 3)
    throw new AlumniDataError("invalid", "A job needs a company, a role and an industry.");
  const choices = async (table: string) =>
    (
      await data.db
        .prepare(`SELECT id, name FROM ${table} WHERE active = 1 ORDER BY name`)
        .all<Choice>()
    ).results;
  if (reply.industryId) {
    const industries = await choices("alumni_industries");
    if (!industries.some((industry) => industry.id === reply.industryId))
      throw new InvalidChoiceError("industry", industries);
  }
  if (reply.helpKindIds.length) {
    const kinds = await choices("alumni_help_kinds");
    if (reply.helpKindIds.some((kind) => !kinds.some((choice) => choice.id === kind)))
      throw new InvalidChoiceError("kind of help", kinds);
  }
  if (reply.contacts.some((contact) => !current.contacts.some((known) => known.id === contact.id)))
    throw new AlumniDataError("invalid", "A contact detail does not belong to this alum.");

  if (reply.employer && reply.title && reply.industryId) {
    const sameEmployer =
      current.employer !== null && nameKey(current.employer) === nameKey(reply.employer);
    if (sameEmployer && current.industryId === reply.industryId) {
      // A new title at the same employer is a correction, not a new job.
      if (current.title !== reply.title)
        await data.store.editField(
          { entity: "alumni_profile", recordId: personId, field: "job_title" },
          reply.title,
          admin,
        );
    } else
      await data.store.changeJob(
        personId,
        {
          employerId: await data.store.findOrCreateEmployer(reply.employer),
          title: reply.title,
          industryId: reply.industryId,
        },
        admin,
      );
  }
  for (const contact of reply.contacts)
    await data.store.setContactVisibility(
      contact.id,
      contact.share ? "members" : "hidden",
      adminMemberId,
    );
  const now = data.now();
  for (const contact of reply.newContacts)
    await data.store.addContact(personId, contact, adminMemberId, now);
  await data.store.setHelpOffered(personId, reply.helpKindIds, adminMemberId);
  if ((reply.note || null) !== current.note)
    await data.store.editField(
      { entity: "alumni_profile", recordId: personId, field: "note" },
      reply.note || null,
      admin,
    );
  if (reply.listed !== current.listed)
    await data.store.editField(
      { entity: "alumni_profile", recordId: personId, field: "listing_status" },
      reply.listed ? "listed" : "hidden",
      admin,
    );
  await data.store.markConfirmed(
    personId,
    adminMemberId,
    reply.contacts.filter((contact) => contact.share).map((contact) => contact.id),
  );
}
