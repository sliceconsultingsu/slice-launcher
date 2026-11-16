// A student's own profile: creating it on first use, changing it later, and recording what they
// did with a match.
//
// "Student" means a Slice consultant using the app. Every operation here works on the signed-in
// member's own record only: the member ID comes from the platform, never from the request, so one
// student cannot change another's answers. These functions check no app permissions; the caller
// checks that the member may use the app first.
import { z } from "zod";
import { AlumniDataError, contactKey, nameKey } from "./store";
import { InvalidChoiceError, type Choice, type MatchOutcome } from "./reads";

type Database = Pick<D1Database, "prepare" | "batch">;

const choiceId = z.string().trim().min(1).max(80);
const choices = (max: number) => z.array(choiceId).max(max);
export const studentAnswersSchema = z.strictObject({
  graduationYear: z.number().int().min(1950).max(2100),
  /** One to three majors; the first is the primary major. */
  majorIds: choices(3).min(1),
  /** One short sentence in the student's own words. Not scored by matching. */
  careerGoal: z.string().trim().max(300).nullable().default(null),
  skillIds: choices(8).default([]),
  industryIds: choices(5).min(1),
  locationIds: choices(5).default([]),
  helpKindIds: choices(6).min(1),
  /** Kept so the link carries over when the student graduates. */
  linkedinUrl: z.string().trim().max(300).nullable().default(null),
});
export type StudentAnswers = z.input<typeof studentAnswersSchema>;

export interface StudentStoreOptions {
  now?: () => string;
  newId?: () => string;
}

export class StudentStore {
  private readonly now: () => string;
  private readonly newId: () => string;
  constructor(
    private readonly db: Database,
    options: StudentStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  /**
   * Saves the signed-in member's answers, creating their student profile the first time.
   * Every choice must be on its fixed list; otherwise nothing is saved and the error lists the
   * valid choices. All of one save is written together, so a profile is never half updated.
   */
  async saveProfile(
    member: { id: string; name: string },
    input: StudentAnswers,
  ): Promise<{ personId: string; created: boolean }> {
    const parsed = studentAnswersSchema.safeParse(input);
    if (!parsed.success) throw new AlumniDataError("invalid", "The profile answers are not valid.");
    const answers = parsed.data;
    const majorIds = unique(answers.majorIds);
    const skillIds = unique(answers.skillIds);
    const industryIds = unique(answers.industryIds);
    const locationIds = unique(answers.locationIds);
    const helpKindIds = unique(answers.helpKindIds);
    const careerGoal = answers.careerGoal || null;
    const linkedinUrl = answers.linkedinUrl || null;
    if (linkedinUrl && !/^linkedin\.com\/in\/[^/]+$/.test(contactKey("linkedin", linkedinUrl)))
      throw new AlumniDataError(
        "invalid",
        "The LinkedIn link must be a profile address, such as linkedin.com/in/your-name.",
      );
    await this.requireChoices("major", majorIds, MAJORS);
    await this.requireChoices("skill", skillIds, SKILLS);
    await this.requireChoices("industry", industryIds, INDUSTRIES);
    await this.requireChoices("city", locationIds, CITIES);
    await this.requireChoices("kind of help", helpKindIds, HELP_KINDS);

    const now = this.now();
    const student = await this.db
      .prepare("SELECT person_id FROM alumni_student_profiles WHERE member_id = ?")
      .bind(member.id)
      .first<{ person_id: string }>();
    const statements: D1PreparedStatement[] = [];
    let personId: string;
    if (student) {
      personId = student.person_id;
      statements.push(
        this.db
          .prepare(
            "UPDATE alumni_people SET graduation_year = ?, updated_at = ? WHERE id = ? AND graduation_year <> ?",
          )
          .bind(answers.graduationYear, now, personId, answers.graduationYear),
        this.db
          .prepare(
            "UPDATE alumni_student_profiles SET last_verified_at = ?, updated_at = ? WHERE person_id = ?",
          )
          .bind(now, now, personId),
      );
    } else {
      // A member who is already in the database as an alum keeps their one person record.
      const alum = await this.db
        .prepare("SELECT person_id FROM alumni_profiles WHERE member_id = ?")
        .bind(member.id)
        .first<{ person_id: string }>();
      if (alum) personId = alum.person_id;
      else {
        const key = nameKey(member.name);
        if (!key)
          throw new AlumniDataError(
            "invalid",
            "Your Slice account name has no letters. Update it on your account page first.",
          );
        personId = this.newId();
        const namesake = await this.db
          .prepare(
            "SELECT id FROM alumni_people WHERE name_key = ? AND graduation_year = ? AND disambiguator = '' AND merged_into IS NULL",
          )
          .bind(key, answers.graduationYear)
          .first<{ id: string }>();
        statements.push(
          this.db
            .prepare(
              "INSERT INTO alumni_people(id, full_name, name_key, disambiguator, graduation_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            // Someone with this name and year already exists. The student is not blocked: they get
            // their own record with a tie-breaker, and an admin decides whether the two are one.
            .bind(
              personId,
              member.name.trim(),
              key,
              namesake ? `student ${personId.slice(0, 8)}` : "",
              answers.graduationYear,
              now,
              now,
            ),
        );
        if (namesake)
          statements.push(
            this.db
              .prepare(
                "INSERT INTO alumni_merge_candidates(id, person_id, other_person_id, reason, found_at) VALUES (?, ?, ?, ?, ?)",
              )
              .bind(
                this.newId(),
                namesake.id,
                personId,
                "A new student profile has the same name and graduation year as this record.",
                now,
              ),
          );
      }
      statements.push(
        this.db
          .prepare(
            "INSERT INTO alumni_student_profiles(person_id, member_id, last_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(personId, member.id, now, now, now),
      );
    }
    statements.push(
      this.db
        .prepare(
          `INSERT INTO alumni_student_answers(person_id, career_goal, linkedin_url, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(person_id) DO UPDATE SET career_goal = excluded.career_goal, linkedin_url = excluded.linkedin_url, updated_at = excluded.updated_at`,
        )
        .bind(personId, careerGoal, linkedinUrl, now),
      this.db.prepare("DELETE FROM alumni_person_majors WHERE person_id = ?").bind(personId),
      ...majorIds.map((id, index) =>
        this.db
          .prepare(
            "INSERT INTO alumni_person_majors(person_id, major_id, kind, is_primary) VALUES (?, ?, 'major', ?)",
          )
          .bind(personId, id, index === 0 ? 1 : 0),
      ),
      ...this.replaceList("alumni_student_skills", "skill_id", personId, skillIds),
      ...this.replaceList("alumni_student_industries", "industry_id", personId, industryIds),
      ...this.replaceList("alumni_student_cities", "location_id", personId, locationIds),
      ...this.replaceList("alumni_help_sought", "help_kind_id", personId, helpKindIds),
    );
    try {
      await this.db.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UNIQUE constraint failed: alumni_people"))
        throw new AlumniDataError(
          "conflict",
          "Another record already has this name and graduation year. Ask an admin to sort it out.",
        );
      if (message.includes("UNIQUE constraint failed: alumni_student_profiles"))
        throw new AlumniDataError("conflict", "Your profile was just created. Reload the page.");
      throw error;
    }
    return { personId, created: !student };
  }

  /** The signed-in student says what they did with one of their own matches, or clears it. */
  async recordOutcome(
    memberId: string,
    matchId: string,
    outcome: MatchOutcome | null,
  ): Promise<void> {
    if (outcome !== null && outcome !== "contacted" && outcome !== "not-for-me")
      throw new AlumniDataError("invalid", "The outcome is not valid.");
    const result = await this.db
      .prepare(
        `UPDATE alumni_matches SET outcome = ?, outcome_at = ?
         WHERE id = ? AND student_id = (SELECT person_id FROM alumni_student_profiles WHERE member_id = ?)`,
      )
      .bind(outcome, outcome === null ? null : this.now(), matchId, memberId)
      .run();
    if (!result.meta.changes) throw new AlumniDataError("not-found", "No such match.");
  }

  private replaceList(table: string, column: string, personId: string, ids: string[]) {
    return [
      this.db.prepare(`DELETE FROM ${table} WHERE person_id = ?`).bind(personId),
      ...ids.map((id) =>
        this.db
          .prepare(`INSERT INTO ${table}(person_id, ${column}) VALUES (?, ?)`)
          .bind(personId, id),
      ),
    ];
  }

  private async requireChoices(field: string, ids: string[], listSql: string): Promise<void> {
    if (!ids.length) return;
    const valid = (await this.db.prepare(listSql).all<Choice>()).results;
    if (ids.some((id) => !valid.some((choice) => choice.id === id)))
      throw new InvalidChoiceError(field, valid);
  }
}

const MAJORS =
  "SELECT id, name FROM alumni_majors WHERE active = 1 AND current_major_id IS NULL ORDER BY name";
const SKILLS = "SELECT id, name FROM alumni_skills WHERE active = 1 ORDER BY name";
const INDUSTRIES = "SELECT id, name FROM alumni_industries WHERE active = 1 ORDER BY name";
const HELP_KINDS = "SELECT id, name FROM alumni_help_kinds WHERE active = 1 ORDER BY name";
const CITIES =
  "SELECT id, city || ', ' || CASE WHEN region = '' THEN country ELSE region END AS name FROM alumni_locations ORDER BY city, region";

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
