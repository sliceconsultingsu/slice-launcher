// Alumni database operations: only the rules the schema tests exercise.
//
// These functions are the agreed way to change alumni data. They contain no screens, API routes,
// permission checks or matching logic: callers (the future API, MCP tools and refresh runner) must
// check the person's permissions first. Every change is written in one D1 batch, which D1 runs as a
// single transaction, together with its history row.
//
// Guarding against stale reads: each operation reads the record, then writes. If someone else
// changed the record in between, the write must not go ahead. Each batch therefore starts with its
// history row, inserted with actor_type set to an invalid value unless the record still looks as it
// did when read. The invalid value fails the alumni_change_history actor-type CHECK rule, so D1
// rolls back the whole batch and we report the record as changed.
import { z } from "zod";

type Database = Pick<D1Database, "prepare" | "batch">;
type Statement = D1PreparedStatement;

export type ActorType = "alumnus" | "student" | "admin" | "runner" | "system";
export interface Actor {
  type: ActorType;
  /** Required for alumnus, student and admin; omitted for runner and system. */
  memberId?: string;
}
export type ContactKind = "email" | "phone" | "linkedin" | "other";

export class AlumniDataError extends Error {
  constructor(
    readonly code: "invalid" | "not-found" | "stale" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "AlumniDataError";
  }
}

/** Lowercase, accents removed, hyphens and slashes as spaces, other punctuation removed. */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[-‐-―/_]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized copy of a contact detail, used to recognize the same email or LinkedIn profile. */
export function contactKey(kind: ContactKind, value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (kind === "phone") return trimmed.replace(/[^0-9+]/g, "");
  if (kind === "linkedin") {
    const path = trimmed
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");
    return path.startsWith("linkedin.com/") ? path : `linkedin.com/${path}`;
  }
  return trimmed;
}

const contactInput = z.strictObject({
  kind: z.enum(["email", "phone", "linkedin", "other"]),
  value: z.string().trim().min(1).max(300),
});
const newAlumnusSchema = z.strictObject({
  fullName: z.string().trim().min(1).max(120),
  graduationYear: z.number().int().min(1950).max(2100),
  disambiguator: z.string().trim().max(40).default(""),
  contacts: z.array(contactInput).max(20).default([]),
});
export type NewAlumnus = z.input<typeof newAlumnusSchema>;
export type AddAlumnusResult =
  | { outcome: "created"; personId: string }
  | { outcome: "attached"; personId: string }
  | { outcome: "needs-review"; personId: string; candidateId: string };

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const jobSchema = z.strictObject({
  employerId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  industryId: z.string().min(1),
  locationId: z.string().min(1).nullable().default(null),
  startMonth: month.nullable().default(null),
});
export type Job = z.input<typeof jobSchema>;
type CompleteJob = z.output<typeof jobSchema>;

/** Fields that can be edited directly or proposed, other than the whole current job. */
const simpleFields = {
  alumni_profile: {
    table: "alumni_profiles",
    columns: {
      job_title: z.string().trim().min(1).max(120),
      listing_status: z.enum(["listed", "hidden"]),
      note: z.string().max(2000).nullable(),
    },
  },
  student_profile: {
    table: "alumni_student_profiles",
    columns: { note: z.string().max(2000).nullable() },
  },
} as const;
type SimpleEntity = keyof typeof simpleFields;
export interface FieldRef {
  entity: SimpleEntity;
  /** The person ID of the profile. */
  recordId: string;
  field: string;
}

export interface Proposal {
  entity: "alumni_profile" | "student_profile";
  recordId: string;
  field: string;
  /** Text for simple fields; for current_job, the job object (stored as JSON). */
  proposedValue: string | null | Job;
  source: string;
  foundAt: string;
}

interface ProfileJobRow {
  job_employer_id: string | null;
  job_title: string | null;
  job_industry_id: string | null;
  job_location_id: string | null;
  job_start_month: string | null;
  job_last_verified_at: string | null;
}

export interface StoreOptions {
  now?: () => string;
  newId?: () => string;
}

export class AlumniStore {
  private readonly now: () => string;
  private readonly newId: () => string;
  constructor(
    private readonly db: Database,
    options: StoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  /**
   * Adds an alumnus, unless an active person with the same name key, year and tie-breaker exists.
   * Then: if they share an email or LinkedIn and none conflicts, the new contact details are
   * attached to the existing person (saved hidden). Otherwise nothing is saved to profiles and the
   * incoming record goes to alumni_merge_candidates for an admin to decide.
   */
  async addAlumnus(input: NewAlumnus): Promise<AddAlumnusResult> {
    const parsed = newAlumnusSchema.safeParse(input);
    if (!parsed.success) throw new AlumniDataError("invalid", "The alumni record is not valid.");
    const record = parsed.data;
    const key = nameKey(record.fullName);
    if (!key) throw new AlumniDataError("invalid", "The name has no letters or digits.");
    const now = this.now();
    const contacts = dedupeContacts(record.contacts);

    const existing = await this.db
      .prepare(
        "SELECT id FROM alumni_people WHERE name_key = ? AND graduation_year = ? AND disambiguator = ? AND merged_into IS NULL",
      )
      .bind(key, record.graduationYear, record.disambiguator)
      .first<{ id: string }>();

    if (!existing) {
      const personId = this.newId();
      await this.run(
        [
          this.db
            .prepare(
              "INSERT INTO alumni_people(id, full_name, name_key, disambiguator, graduation_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(
              personId,
              record.fullName,
              key,
              record.disambiguator,
              record.graduationYear,
              now,
              now,
            ),
          this.db
            .prepare(
              "INSERT INTO alumni_profiles(person_id, created_at, updated_at) VALUES (?, ?, ?)",
            )
            .bind(personId, now, now),
          ...contacts.map((contact) => this.insertContact(personId, contact, now)),
        ],
        "A person with this name, graduation year and tie-breaker already exists.",
      );
      return { outcome: "created", personId };
    }

    const known = (
      await this.db
        .prepare(
          "SELECT kind, value_key FROM alumni_contacts WHERE person_id = ? AND kind IN ('email', 'linkedin')",
        )
        .bind(existing.id)
        .all<{ kind: ContactKind; value_key: string }>()
    ).results;
    let shared = false;
    let conflict = false;
    for (const kind of ["email", "linkedin"] as const) {
      const theirs = new Set(known.filter((c) => c.kind === kind).map((c) => c.value_key));
      const ours = contacts.filter((c) => c.kind === kind).map((c) => c.key);
      const overlap = ours.some((k) => theirs.has(k));
      shared ||= overlap;
      if (theirs.size > 0 && ours.length > 0 && !overlap) conflict = true;
    }

    if (shared && !conflict) {
      const hasProfile = await this.db
        .prepare("SELECT 1 AS found FROM alumni_profiles WHERE person_id = ?")
        .bind(existing.id)
        .first();
      if (!hasProfile)
        throw new AlumniDataError("not-found", "The matching person has no alumni profile.");
      const allKnown = (
        await this.db
          .prepare("SELECT kind, value_key FROM alumni_contacts WHERE person_id = ?")
          .bind(existing.id)
          .all<{ kind: ContactKind; value_key: string }>()
      ).results.map((c) => `${c.kind}:${c.value_key}`);
      const added = contacts.filter((c) => !allKnown.includes(`${c.kind}:${c.key}`));
      const statements: Statement[] = [];
      for (const contact of added) {
        statements.push(
          this.historyRow(
            "alumni_profile",
            existing.id,
            "contact_added",
            null,
            JSON.stringify({ kind: contact.kind, value: contact.value, visibility: "hidden" }),
            { type: "system" },
            null,
            now,
          ),
          this.insertContact(existing.id, contact, now),
        );
      }
      if (statements.length) await this.run(statements);
      return { outcome: "attached", personId: existing.id };
    }

    const candidateId = this.newId();
    await this.db
      .prepare(
        "INSERT INTO alumni_merge_candidates(id, person_id, incoming_record, reason, found_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        candidateId,
        existing.id,
        JSON.stringify(record),
        conflict
          ? "Same name and graduation year, but the email or LinkedIn differs from the existing record."
          : "Same name and graduation year, but no shared email or LinkedIn confirms it is the same person.",
        now,
      )
      .run();
    return { outcome: "needs-review", personId: existing.id, candidateId };
  }

  /**
   * Records a new current job. The previous current job, if any, moves to past jobs ending in
   * `endMonth` (default: this month), so no job is ever in both places.
   */
  async changeJob(personId: string, job: Job, actor: Actor, endMonth?: string): Promise<void> {
    const parsedJob = jobSchema.safeParse(job);
    if (!parsedJob.success || (endMonth !== undefined && !month.safeParse(endMonth).success))
      throw new AlumniDataError("invalid", "The job is not valid.");
    const before = await this.readJob(personId);
    await this.run(
      this.jobChangeStatements(personId, before, parsedJob.data, actor, null, endMonth),
    );
  }

  /** Applies a direct edit by the alumnus, student or an admin immediately, with history. */
  async editField(ref: FieldRef, value: string | null, actor: Actor): Promise<void> {
    const { table, column, schema } = simpleField(ref);
    if (!schema.safeParse(value).success)
      throw new AlumniDataError("invalid", "The new value is not valid.");
    const before = await this.readSimple(ref, table, column);
    await this.run(this.simpleStatements(ref, table, column, before, value, actor, null));
  }

  /** Stores a proposed change for review. It never changes the profile itself. */
  async proposeChange(proposal: Proposal): Promise<string> {
    let current: string | null;
    let proposed: string | null;
    if (proposal.entity === "alumni_profile" && proposal.field === "current_job") {
      const job = jobSchema.safeParse(proposal.proposedValue);
      if (!job.success) throw new AlumniDataError("invalid", "The proposed job is not valid.");
      current = jobJson(await this.readJob(proposal.recordId));
      proposed = jobJson(job.data);
    } else {
      const ref = { entity: proposal.entity, recordId: proposal.recordId, field: proposal.field };
      const { table, column, schema } = simpleField(ref);
      if (typeof proposal.proposedValue === "object" && proposal.proposedValue !== null)
        throw new AlumniDataError("invalid", "The proposed value is not valid.");
      if (!schema.safeParse(proposal.proposedValue).success)
        throw new AlumniDataError("invalid", "The proposed value is not valid.");
      current = await this.readSimple(ref, table, column);
      proposed = proposal.proposedValue;
    }
    if (proposed === null) throw new AlumniDataError("invalid", "A proposal needs a value.");
    const id = this.newId();
    await this.db
      .prepare(
        "INSERT INTO alumni_pending_changes(id, entity, record_id, field, current_value, proposed_value, source, found_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        proposal.entity,
        proposal.recordId,
        proposal.field,
        current,
        proposed,
        proposal.source,
        proposal.foundAt,
      )
      .run();
    return id;
  }

  /**
   * An admin approves or rejects a proposal. Approval applies it with history (actor: runner,
   * linked to the proposal, which records the reviewer). Approval is refused, and the proposal
   * stays pending, if the field changed after the proposal was made.
   */
  async reviewChange(
    pendingId: string,
    decision: "approved" | "rejected",
    reviewerMemberId: string,
  ): Promise<void> {
    const pending = await this.db
      .prepare("SELECT * FROM alumni_pending_changes WHERE id = ?")
      .bind(pendingId)
      .first<{
        entity: string;
        record_id: string;
        field: string;
        current_value: string | null;
        proposed_value: string;
        status: string;
      }>();
    if (!pending) throw new AlumniDataError("not-found", "No such proposal.");
    if (pending.status !== "pending")
      throw new AlumniDataError("conflict", "This proposal has already been reviewed.");
    const now = this.now();
    const markReviewed = this.db
      .prepare(
        "UPDATE alumni_pending_changes SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'",
      )
      .bind(decision, reviewerMemberId, now, pendingId);
    if (decision === "rejected") {
      const result = await markReviewed.run();
      if (!result.meta.changes)
        throw new AlumniDataError("conflict", "This proposal has already been reviewed.");
      return;
    }

    const runner: Actor = { type: "runner" };
    let statements: Statement[];
    if (pending.entity === "alumni_profile" && pending.field === "current_job") {
      const before = await this.readJob(pending.record_id);
      if (jobJson(before) !== pending.current_value) throw staleProposal();
      const job = jobSchema.parse(JSON.parse(pending.proposed_value));
      statements = this.jobChangeStatements(pending.record_id, before, job, runner, pendingId);
    } else {
      const ref = {
        entity: pending.entity as SimpleEntity,
        recordId: pending.record_id,
        field: pending.field,
      };
      const { table, column } = simpleField(ref);
      const before = await this.readSimple(ref, table, column);
      if (before !== pending.current_value) throw staleProposal();
      statements = this.simpleStatements(
        ref,
        table,
        column,
        before,
        pending.proposed_value,
        runner,
        pendingId,
      );
    }
    await this.run([...statements, markReviewed]);
  }

  /**
   * An admin merges a duplicate into the record being kept. Nothing is deleted: the duplicate keeps
   * its own details and points at the kept record. Optionally closes the merge candidate.
   */
  async mergePeople(
    duplicateId: string,
    keptId: string,
    adminMemberId: string,
    candidateId?: string,
  ): Promise<void> {
    if (duplicateId === keptId)
      throw new AlumniDataError("invalid", "A record cannot be merged into itself.");
    const people = await this.db
      .prepare(
        "SELECT id, merged_into, (SELECT count(*) FROM alumni_people c WHERE c.merged_into = p.id) AS merged_children FROM alumni_people p WHERE id IN (?, ?)",
      )
      .bind(duplicateId, keptId)
      .all<{ id: string; merged_into: string | null; merged_children: number }>();
    if (people.results.length !== 2) throw new AlumniDataError("not-found", "No such person.");
    if (people.results.some((p) => p.merged_into !== null))
      throw new AlumniDataError("conflict", "Both records must be active (not already merged).");
    if (people.results.some((p) => p.id === duplicateId && p.merged_children > 0))
      throw new AlumniDataError(
        "conflict",
        "Other records are merged into this duplicate. Merge the kept record into it instead, or reverse those merges first.",
      );
    const now = this.now();
    const admin: Actor = { type: "admin", memberId: adminMemberId };
    const statements = [
      this.historyRow("person", duplicateId, "merged_into", null, keptId, admin, null, now, {
        sql: "(SELECT merged_into IS NULL AND NOT EXISTS (SELECT 1 FROM alumni_people c WHERE c.merged_into = p.id) FROM alumni_people p WHERE id = ?) AND (SELECT merged_into IS NULL FROM alumni_people WHERE id = ?)",
        params: [duplicateId, keptId],
      }),
      this.db
        .prepare("UPDATE alumni_people SET merged_into = ?, updated_at = ? WHERE id = ?")
        .bind(keptId, now, duplicateId),
    ];
    if (candidateId)
      statements.push(
        this.db
          .prepare(
            "UPDATE alumni_merge_candidates SET status = 'merged', reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'",
          )
          .bind(adminMemberId, now, candidateId),
      );
    await this.run(statements);
  }

  /** An admin reverses a merge: the duplicate becomes an active record again, with history. */
  async reverseMerge(duplicateId: string, adminMemberId: string): Promise<void> {
    const person = await this.db
      .prepare("SELECT merged_into FROM alumni_people WHERE id = ?")
      .bind(duplicateId)
      .first<{ merged_into: string | null }>();
    if (!person) throw new AlumniDataError("not-found", "No such person.");
    if (person.merged_into === null)
      throw new AlumniDataError("conflict", "This record is not merged.");
    const now = this.now();
    await this.run(
      [
        this.historyRow(
          "person",
          duplicateId,
          "merged_into",
          person.merged_into,
          null,
          { type: "admin", memberId: adminMemberId },
          null,
          now,
          {
            sql: "(SELECT merged_into IS ? FROM alumni_people WHERE id = ?)",
            params: [person.merged_into, duplicateId],
          },
        ),
        this.db
          .prepare("UPDATE alumni_people SET merged_into = NULL, updated_at = ? WHERE id = ?")
          .bind(now, duplicateId),
      ],
      "Cannot reverse: another active record now has the same name, graduation year and tie-breaker.",
    );
  }

  // ---- helpers -------------------------------------------------------------------------------

  private insertContact(
    personId: string,
    contact: { kind: ContactKind; value: string; key: string },
    now: string,
  ): Statement {
    // visibility is deliberately omitted so the table default ('hidden') applies.
    return this.db
      .prepare(
        "INSERT INTO alumni_contacts(id, person_id, kind, value, value_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(this.newId(), personId, contact.kind, contact.value, contact.key, now, now);
  }

  private async readJob(personId: string): Promise<ProfileJobRow> {
    const row = await this.db
      .prepare(
        "SELECT job_employer_id, job_title, job_industry_id, job_location_id, job_start_month, job_last_verified_at FROM alumni_profiles WHERE person_id = ?",
      )
      .bind(personId)
      .first<ProfileJobRow>();
    if (!row) throw new AlumniDataError("not-found", "No such alumni profile.");
    return row;
  }

  private async readSimple(ref: FieldRef, table: string, column: string): Promise<string | null> {
    const row = await this.db
      .prepare(`SELECT ${column} AS value FROM ${table} WHERE person_id = ?`)
      .bind(ref.recordId)
      .first<{ value: string | null }>();
    if (!row) throw new AlumniDataError("not-found", "No such profile.");
    return row.value;
  }

  private jobChangeStatements(
    personId: string,
    before: ProfileJobRow,
    job: CompleteJob,
    actor: Actor,
    pendingId: string | null,
    endMonth?: string,
  ): Statement[] {
    const now = this.now();
    const statements = [
      this.historyRow(
        "alumni_profile",
        personId,
        "current_job",
        jobJson(before),
        jobJson(job),
        actor,
        pendingId,
        now,
        {
          sql: "EXISTS (SELECT 1 FROM alumni_profiles WHERE person_id = ? AND job_employer_id IS ? AND job_title IS ? AND job_industry_id IS ? AND job_location_id IS ? AND job_start_month IS ?)",
          params: [
            personId,
            before.job_employer_id,
            before.job_title,
            before.job_industry_id,
            before.job_location_id,
            before.job_start_month,
          ],
        },
      ),
    ];
    if (before.job_employer_id !== null)
      statements.push(
        this.db
          .prepare(
            "INSERT INTO alumni_experiences(id, person_id, employer_id, title, industry_id, location_id, start_month, end_month, last_verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            this.newId(),
            personId,
            before.job_employer_id,
            before.job_title,
            before.job_industry_id,
            before.job_location_id,
            before.job_start_month,
            endMonth ?? now.slice(0, 7),
            before.job_last_verified_at,
            now,
          ),
      );
    statements.push(
      this.db
        .prepare(
          "UPDATE alumni_profiles SET job_employer_id = ?, job_title = ?, job_industry_id = ?, job_location_id = ?, job_start_month = ?, job_last_verified_at = ?, updated_at = ? WHERE person_id = ?",
        )
        .bind(
          job.employerId,
          job.title,
          job.industryId,
          job.locationId,
          job.startMonth,
          now,
          now,
          personId,
        ),
    );
    return statements;
  }

  private simpleStatements(
    ref: FieldRef,
    table: string,
    column: string,
    before: string | null,
    value: string | null,
    actor: Actor,
    pendingId: string | null,
  ): Statement[] {
    const now = this.now();
    return [
      this.historyRow(ref.entity, ref.recordId, ref.field, before, value, actor, pendingId, now, {
        sql: `EXISTS (SELECT 1 FROM ${table} WHERE person_id = ? AND ${column} IS ?)`,
        params: [ref.recordId, before],
      }),
      this.db
        .prepare(`UPDATE ${table} SET ${column} = ?, updated_at = ? WHERE person_id = ?`)
        .bind(value, now, ref.recordId),
    ];
  }

  /**
   * A history row. With `stillCurrent`, the row is only valid if that SQL condition is true at
   * write time; otherwise actor_type becomes 'stale-write', which the CHECK rule rejects, rolling
   * back the whole batch (see the note at the top of this file).
   */
  private historyRow(
    entity: string,
    recordId: string,
    field: string,
    oldValue: string | null,
    newValue: string | null,
    actor: Actor,
    pendingId: string | null,
    now: string,
    stillCurrent?: { sql: string; params: unknown[] },
  ): Statement {
    if ((actor.type === "runner" || actor.type === "system") !== (actor.memberId === undefined))
      throw new AlumniDataError(
        "invalid",
        "This kind of actor needs a member ID, or must not have one.",
      );
    const conditions = stillCurrent ? [stillCurrent.sql] : [];
    const params = [...(stillCurrent?.params ?? [])];
    if (pendingId !== null) {
      // An approval is only valid while the proposal is still pending (no double approval).
      conditions.push(
        "EXISTS (SELECT 1 FROM alumni_pending_changes WHERE id = ? AND status = 'pending')",
      );
      params.push(pendingId);
    }
    const guard = conditions.length ? conditions.join(" AND ") : "1";
    return this.db
      .prepare(
        `INSERT INTO alumni_change_history(id, entity, record_id, field, old_value, new_value, actor_type, actor_member_id, pending_change_id, changed_at) SELECT ?, ?, ?, ?, ?, ?, CASE WHEN ${guard} THEN ? ELSE 'stale-write' END, ?, ?, ?`,
      )
      .bind(
        this.newId(),
        entity,
        recordId,
        field,
        oldValue,
        newValue,
        ...params,
        actor.type,
        actor.memberId ?? null,
        pendingId,
        now,
      );
  }

  /** Runs statements as one transaction and turns known database refusals into clear errors. */
  private async run(statements: Statement[], uniqueMessage?: string): Promise<void> {
    try {
      await this.db.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("CHECK constraint failed") && message.includes("actor_type"))
        throw new AlumniDataError(
          "stale",
          "The record changed while this update was being made. Reload and try again.",
        );
      if (uniqueMessage && message.includes("UNIQUE constraint failed: alumni_people"))
        throw new AlumniDataError("conflict", uniqueMessage);
      throw error;
    }
  }
}

function simpleField(ref: FieldRef) {
  const entity = simpleFields[ref.entity] as
    { table: string; columns: Record<string, z.ZodType> } | undefined;
  const schema = entity?.columns[ref.field];
  if (!entity || !schema)
    throw new AlumniDataError("invalid", "This field cannot be changed here.");
  return { table: entity.table, column: ref.field, schema };
}

function dedupeContacts(contacts: { kind: ContactKind; value: string }[]) {
  const seen = new Set<string>();
  const result: { kind: ContactKind; value: string; key: string }[] = [];
  for (const contact of contacts) {
    const key = contactKey(contact.kind, contact.value);
    if (!key || seen.has(`${contact.kind}:${key}`)) continue;
    seen.add(`${contact.kind}:${key}`);
    result.push({ ...contact, key });
  }
  return result;
}

/** The current job as JSON with a fixed key order, or null when there is no current job. */
export function jobJson(job: ProfileJobRow | CompleteJob): string | null {
  const value =
    "employerId" in job
      ? job
      : {
          employerId: job.job_employer_id,
          title: job.job_title,
          industryId: job.job_industry_id,
          locationId: job.job_location_id,
          startMonth: job.job_start_month,
        };
  if (value.employerId === null) return null;
  return JSON.stringify({
    employerId: value.employerId,
    title: value.title,
    industryId: value.industryId,
    locationId: value.locationId,
    startMonth: value.startMonth,
  });
}

function staleProposal() {
  return new AlumniDataError(
    "stale",
    "The profile changed after this proposal was made. Reject it, or wait for a fresh proposal.",
  );
}
