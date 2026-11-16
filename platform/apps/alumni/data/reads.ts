// Reading alumni data back for screens and assistant tools.
//
// Every screen and every tool reads through these functions, so they cannot show different
// things. Each read takes who is asking (the viewer) and returns only what that person may see:
//   * a member never gets a hidden alum, a record merged into another, or a hidden contact detail;
//   * a student's answers and matches are returned only for that student's own member ID;
//   * admins may ask to include hidden alumni and see hidden contact details, marked as hidden.
// These functions check no permissions. The caller checks the person's permissions first and
// passes `admin: true` only for a member who holds the admin permission.
import { z } from "zod";
import { AlumniDataError, nameKey } from "./store";

type Database = Pick<D1Database, "prepare" | "batch">;

export interface Viewer {
  memberId: string;
  admin: boolean;
}
export interface Choice {
  id: string;
  name: string;
}
export interface Lists {
  industries: Choice[];
  helpKinds: Choice[];
  skills: Choice[];
  schools: Choice[];
  majors: (Choice & { schoolId: string })[];
  /** Only the cities where a listed alum works now. */
  cities: Choice[];
  /**
   * The IDs at least one listed alum has. The explorer offers only these as filters, so it never
   * shows a filter that can find nobody. Choosing answers for a profile uses the full lists.
   */
  inUse: { industries: string[]; schools: string[]; majors: string[]; helpKinds: string[] };
}

/** A choice that is not on its fixed list. Carries the valid choices so callers can show them. */
export class InvalidChoiceError extends AlumniDataError {
  constructor(
    readonly field: string,
    readonly valid: Choice[],
  ) {
    super("invalid", `That ${field} is not on the list.`);
    this.name = "InvalidChoiceError";
  }
}

const choiceId = z.string().trim().min(1).max(80);
const year = z.number().int().min(1950).max(2100);
export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 50;
export const searchSchema = z.strictObject({
  /** Part of a name or an employer. */
  q: z.string().trim().max(80).optional(),
  industry: choiceId.optional(),
  school: choiceId.optional(),
  major: choiceId.optional(),
  city: choiceId.optional(),
  help: choiceId.optional(),
  yearFrom: year.optional(),
  yearTo: year.optional(),
  sort: z.enum(["name", "year", "checked"]).default("name"),
  /** Admins only: also return alumni hidden from listings. Ignored for everyone else. */
  includeHidden: z.boolean().default(false),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});
export type AlumniSearch = z.input<typeof searchSchema>;

export interface AlumSummary {
  id: string;
  name: string;
  graduationYear: number;
  /** Majors as named on the degree, primary first. */
  majors: string[];
  schools: string[];
  title: string | null;
  employer: string | null;
  industry: string | null;
  city: string | null;
  /** When the profile was last confirmed or checked; null when it never has been. */
  lastCheckedAt: string | null;
  /** Present and true only for admins looking at an alum hidden from listings. */
  hidden?: true;
}
export interface PastJob {
  title: string;
  employer: string;
  industry: string;
  city: string | null;
  startMonth: string | null;
  endMonth: string;
}
export interface ContactDetail {
  /** Present for admins only, so they can hide or show the detail. */
  id?: string;
  kind: "email" | "phone" | "linkedin" | "other";
  label: string | null;
  value: string;
  /** Present and true only for admins looking at a hidden detail. */
  hidden?: true;
}
export interface AlumProfile extends AlumSummary {
  minors: string[];
  jobStartMonth: string | null;
  pastJobs: PastJob[];
  helpOffered: string[];
  note: string | null;
  contacts: ContactDetail[];
}
export interface SearchPage {
  results: AlumSummary[];
  total: number;
  /** The offset to ask for next, or null when this is the last page. */
  nextOffset: number | null;
}
export interface StudentProfile {
  personId: string;
  name: string;
  graduationYear: number;
  /** Primary major first. */
  majorIds: string[];
  careerGoal: string | null;
  skillIds: string[];
  industryIds: string[];
  locationIds: string[];
  helpKindIds: string[];
  linkedinUrl: string | null;
  /** True when matching has what it needs: a major, an industry and a kind of help wanted. */
  complete: boolean;
}
export type MatchOutcome = "contacted" | "not-for-me";
export interface StudentMatch {
  id: string;
  round: number;
  matchedAt: string;
  reasons: string[];
  outcome: MatchOutcome | null;
  /** Null when the alum has since been hidden or merged: the match stays, the person does not. */
  alum: AlumSummary | null;
}

interface SummaryRow {
  id: string;
  full_name: string;
  graduation_year: number;
  listing_status: "listed" | "hidden";
  job_title: string | null;
  job_start_month: string | null;
  note: string | null;
  employer: string | null;
  industry: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  last_checked_at: string | null;
}

const SUMMARY_COLUMNS = `p.id, p.full_name, p.graduation_year, pr.listing_status, pr.job_title,
  pr.job_start_month, pr.note, e.name AS employer, i.name AS industry, l.city, l.region, l.country,
  nullif(max(
    coalesce((SELECT max(s.last_success_at) FROM alumni_refresh_last_success s WHERE s.person_id = p.id), ''),
    coalesce(pr.job_last_verified_at, ''),
    coalesce(pr.last_verified_at, '')), '') AS last_checked_at`;
const SUMMARY_FROM = `FROM alumni_profiles pr
  JOIN alumni_people p ON p.id = pr.person_id
  LEFT JOIN alumni_employers e ON e.id = pr.job_employer_id
  LEFT JOIN alumni_industries i ON i.id = pr.job_industry_id
  LEFT JOIN alumni_locations l ON l.id = pr.job_location_id`;
const LISTED = "FROM alumni_profiles pr JOIN alumni_people p ON p.id = pr.person_id";
const IS_LISTED = "pr.listing_status = 'listed' AND p.merged_into IS NULL";
const ORDER = {
  name: "p.name_key, p.graduation_year, p.id",
  year: "p.graduation_year DESC, p.name_key, p.id",
  checked: "last_checked_at IS NULL, last_checked_at DESC, p.name_key, p.id",
} as const;

/**
 * The cities people may choose: those where a listed alum works now. A city only named on a
 * proposal that no admin has approved, or only on a hidden alum's job, is not offered.
 */
export const CITY_CHOICES = `SELECT l.id, l.city, l.region, l.country FROM alumni_locations l
  WHERE EXISTS (
    SELECT 1 FROM alumni_profiles pr JOIN alumni_people p ON p.id = pr.person_id
    WHERE pr.job_location_id = l.id AND pr.listing_status = 'listed' AND p.merged_into IS NULL)
  ORDER BY l.city, l.region`;

export function cityName(city: string, region: string | null, country: string): string {
  return `${city}, ${region || country}`;
}

export class AlumniReads {
  constructor(private readonly db: Database) {}

  /** The fixed lists people choose from. Retired entries are left out. */
  async lists(): Promise<Lists> {
    const [
      industries,
      helpKinds,
      skills,
      schools,
      majors,
      cities,
      usedIndustries,
      usedStudies,
      usedHelp,
    ] = await this.db.batch<Record<string, string>>([
      this.db.prepare("SELECT id, name FROM alumni_industries WHERE active = 1 ORDER BY name"),
      this.db.prepare("SELECT id, name FROM alumni_help_kinds WHERE active = 1 ORDER BY name"),
      this.db.prepare("SELECT id, name FROM alumni_skills WHERE active = 1 ORDER BY name"),
      this.db.prepare("SELECT id, name FROM alumni_schools WHERE active = 1 ORDER BY name"),
      this.db.prepare(
        "SELECT id, name, school_id FROM alumni_majors WHERE active = 1 AND current_major_id IS NULL ORDER BY name",
      ),
      this.db.prepare(CITY_CHOICES),
      this.db.prepare(
        `SELECT DISTINCT pr.job_industry_id AS id ${LISTED} WHERE pr.job_industry_id IS NOT NULL AND ${IS_LISTED}`,
      ),
      this.db.prepare(
        `SELECT DISTINCT ps.current_major_id AS major_id, ps.school_id ${LISTED}
         JOIN alumni_person_schools ps ON ps.person_id = p.id AND ps.kind = 'major' WHERE ${IS_LISTED}`,
      ),
      this.db.prepare(
        `SELECT DISTINCT h.help_kind_id AS id ${LISTED}
         JOIN alumni_help_offered h ON h.person_id = p.id WHERE ${IS_LISTED}`,
      ),
    ]);
    const ids = (result: D1Result<Record<string, string>> | undefined, column = "id") => [
      ...new Set((result?.results ?? []).map((row) => row[column] ?? "")),
    ];
    const choices = (result: D1Result<Record<string, string>> | undefined): Choice[] =>
      (result?.results ?? []).map((row) => ({ id: row.id ?? "", name: row.name ?? "" }));
    return {
      industries: choices(industries),
      helpKinds: choices(helpKinds),
      skills: choices(skills),
      schools: choices(schools),
      majors: (majors?.results ?? []).map((row) => ({
        id: row.id ?? "",
        name: row.name ?? "",
        schoolId: row.school_id ?? "",
      })),
      cities: (cities?.results ?? []).map((row) => ({
        id: row.id ?? "",
        name: cityName(row.city ?? "", row.region ?? null, row.country ?? ""),
      })),
      inUse: {
        industries: ids(usedIndustries),
        schools: ids(usedStudies, "school_id"),
        majors: ids(usedStudies, "major_id"),
        helpKinds: ids(usedHelp),
      },
    };
  }

  /** Listed alumni matching the search, a page at a time. */
  async searchAlumni(viewer: Viewer, search: AlumniSearch = {}): Promise<SearchPage> {
    const parsed = searchSchema.safeParse(search);
    if (!parsed.success) throw new AlumniDataError("invalid", "The search is not valid.");
    const query = parsed.data;
    const lists = await this.lists();
    const check = (field: string, value: string | undefined, valid: Choice[]) => {
      if (value !== undefined && !valid.some((choice) => choice.id === value))
        throw new InvalidChoiceError(field, valid);
    };
    check("industry", query.industry, lists.industries);
    check("school", query.school, lists.schools);
    check("major", query.major, lists.majors);
    check("city", query.city, lists.cities);
    check("kind of help", query.help, lists.helpKinds);

    const where = ["p.merged_into IS NULL"];
    const params: unknown[] = [];
    if (!(viewer.admin && query.includeHidden)) where.push("pr.listing_status = 'listed'");
    if (query.q) {
      // nameKey keeps only letters, digits and spaces, so the text cannot contain LIKE wildcards.
      const key = nameKey(query.q);
      if (!key) where.push("0");
      else {
        where.push(
          "(p.name_key LIKE ? OR e.name_key LIKE ? OR EXISTS (SELECT 1 FROM alumni_aliases a WHERE a.person_id = p.id AND a.name_key LIKE ?))",
        );
        params.push(`%${key}%`, `%${key}%`, `%${key}%`);
      }
    }
    if (query.industry) {
      where.push("pr.job_industry_id = ?");
      params.push(query.industry);
    }
    if (query.school) {
      where.push(
        "EXISTS (SELECT 1 FROM alumni_person_schools ps WHERE ps.person_id = p.id AND ps.school_id = ?)",
      );
      params.push(query.school);
    }
    if (query.major) {
      where.push(
        "EXISTS (SELECT 1 FROM alumni_person_schools ps WHERE ps.person_id = p.id AND ps.current_major_id = ?)",
      );
      params.push(query.major);
    }
    if (query.city) {
      where.push("pr.job_location_id = ?");
      params.push(query.city);
    }
    if (query.help) {
      where.push(
        "EXISTS (SELECT 1 FROM alumni_help_offered h WHERE h.person_id = p.id AND h.help_kind_id = ?)",
      );
      params.push(query.help);
    }
    if (query.yearFrom !== undefined) {
      where.push("p.graduation_year >= ?");
      params.push(query.yearFrom);
    }
    if (query.yearTo !== undefined) {
      where.push("p.graduation_year <= ?");
      params.push(query.yearTo);
    }
    const filter = where.join(" AND ");
    const [count, page] = await this.db.batch<Record<string, unknown>>([
      this.db.prepare(`SELECT count(*) AS n ${SUMMARY_FROM} WHERE ${filter}`).bind(...params),
      this.db
        .prepare(
          `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} WHERE ${filter} ORDER BY ${ORDER[query.sort]} LIMIT ? OFFSET ?`,
        )
        .bind(...params, query.limit, query.offset),
    ]);
    const total = Number(count?.results[0]?.n ?? 0);
    const rows = (page?.results ?? []) as unknown as SummaryRow[];
    const results = await this.summaries(rows, viewer);
    const end = query.offset + rows.length;
    return { results, total, nextOffset: end < total ? end : null };
  }

  /** One alum's profile, or null when there is none the viewer may see. */
  async getAlum(viewer: Viewer, personId: string): Promise<AlumProfile | null> {
    const row = await this.db
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} WHERE p.id = ? AND p.merged_into IS NULL${viewer.admin ? "" : " AND pr.listing_status = 'listed'"}`,
      )
      .bind(personId)
      .first<SummaryRow>();
    if (!row) return null;
    const [summary] = await this.summaries([row], viewer);
    if (!summary) return null;
    const [minors, jobs, help, contacts] = await this.db.batch<Record<string, string | null>>([
      this.db
        .prepare(
          "SELECT degree_name FROM alumni_person_schools WHERE person_id = ? AND kind = 'minor' ORDER BY degree_name",
        )
        .bind(personId),
      this.db
        .prepare(
          `SELECT x.title, e.name AS employer, i.name AS industry, l.city, l.region, l.country, x.start_month, x.end_month
           FROM alumni_experiences x
           JOIN alumni_employers e ON e.id = x.employer_id
           JOIN alumni_industries i ON i.id = x.industry_id
           LEFT JOIN alumni_locations l ON l.id = x.location_id
           WHERE x.person_id = ? ORDER BY x.end_month DESC, x.id`,
        )
        .bind(personId),
      this.db
        .prepare(
          "SELECT k.name FROM alumni_help_offered h JOIN alumni_help_kinds k ON k.id = h.help_kind_id WHERE h.person_id = ? ORDER BY k.name",
        )
        .bind(personId),
      this.db
        .prepare(
          `SELECT id, kind, label, value, visibility FROM alumni_contacts WHERE person_id = ?${viewer.admin ? "" : " AND visibility = 'members'"} ORDER BY kind, value`,
        )
        .bind(personId),
    ]);
    return {
      ...summary,
      minors: (minors?.results ?? []).map((r) => r.degree_name ?? ""),
      jobStartMonth: row.job_start_month,
      pastJobs: (jobs?.results ?? []).map((r) => ({
        title: r.title ?? "",
        employer: r.employer ?? "",
        industry: r.industry ?? "",
        city: r.city ? cityName(r.city, r.region ?? null, r.country ?? "") : null,
        startMonth: r.start_month ?? null,
        endMonth: r.end_month ?? "",
      })),
      helpOffered: (help?.results ?? []).map((r) => r.name ?? ""),
      note: row.note,
      contacts: (contacts?.results ?? []).map((r) => ({
        ...(viewer.admin ? { id: r.id ?? "" } : {}),
        kind: r.kind as ContactDetail["kind"],
        label: r.label ?? null,
        value: r.value ?? "",
        ...(r.visibility === "hidden" ? { hidden: true as const } : {}),
      })),
    };
  }

  /** The signed-in student's own answers, or null before they have saved a profile. */
  async getStudentProfile(memberId: string): Promise<StudentProfile | null> {
    const row = await this.db
      .prepare(
        `SELECT sp.person_id, p.full_name, p.graduation_year, a.career_goal, a.linkedin_url
         FROM alumni_student_profiles sp
         JOIN alumni_people p ON p.id = sp.person_id
         LEFT JOIN alumni_student_answers a ON a.person_id = sp.person_id
         WHERE sp.member_id = ?`,
      )
      .bind(memberId)
      .first<{
        person_id: string;
        full_name: string;
        graduation_year: number;
        career_goal: string | null;
        linkedin_url: string | null;
      }>();
    if (!row) return null;
    const ids = (sql: string) => this.db.prepare(sql).bind(row.person_id);
    const [majors, skills, industries, locations, help] = await this.db.batch<{ id: string }>([
      ids(
        "SELECT major_id AS id FROM alumni_person_majors WHERE person_id = ? AND kind = 'major' ORDER BY is_primary DESC, major_id",
      ),
      ids("SELECT skill_id AS id FROM alumni_student_skills WHERE person_id = ? ORDER BY skill_id"),
      ids(
        "SELECT industry_id AS id FROM alumni_student_industries WHERE person_id = ? ORDER BY industry_id",
      ),
      ids(
        "SELECT location_id AS id FROM alumni_student_cities WHERE person_id = ? ORDER BY location_id",
      ),
      ids(
        "SELECT help_kind_id AS id FROM alumni_help_sought WHERE person_id = ? ORDER BY help_kind_id",
      ),
    ]);
    const list = (result: D1Result<{ id: string }> | undefined) =>
      (result?.results ?? []).map((r) => r.id);
    const profile = {
      personId: row.person_id,
      name: row.full_name,
      graduationYear: row.graduation_year,
      majorIds: list(majors),
      careerGoal: row.career_goal,
      skillIds: list(skills),
      industryIds: list(industries),
      locationIds: list(locations),
      helpKindIds: list(help),
      linkedinUrl: row.linkedin_url,
    };
    return {
      ...profile,
      complete:
        profile.majorIds.length > 0 &&
        profile.industryIds.length > 0 &&
        profile.helpKindIds.length > 0,
    };
  }

  /** The signed-in student's matches, newest set first, best match first within a set. */
  async listMatches(memberId: string): Promise<StudentMatch[]> {
    const matches = (
      await this.db
        .prepare(
          `SELECT m.id, m.alum_id, m.round, m.matched_at, m.reasons, m.outcome
           FROM alumni_matches m
           JOIN alumni_student_profiles sp ON sp.person_id = m.student_id
           WHERE sp.member_id = ? ORDER BY m.round DESC, m.slot`,
        )
        .bind(memberId)
        .all<{
          id: string;
          alum_id: string;
          round: number;
          matched_at: string;
          reasons: string;
          outcome: MatchOutcome | null;
        }>()
    ).results;
    if (!matches.length) return [];
    const alumni = new Map<string, AlumSummary>();
    // A student's matches are read as an ordinary member would see them: a hidden alum is gone.
    const viewer = { memberId, admin: false };
    for (let start = 0; start < matches.length; start += 50) {
      const ids = matches.slice(start, start + 50).map((m) => m.alum_id);
      const rows = (
        await this.db
          .prepare(
            `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} WHERE p.id IN (${ids.map(() => "?").join(", ")}) AND p.merged_into IS NULL AND pr.listing_status = 'listed'`,
          )
          .bind(...ids)
          .all<SummaryRow>()
      ).results;
      for (const summary of await this.summaries(rows, viewer)) alumni.set(summary.id, summary);
    }
    return matches.map((m) => ({
      id: m.id,
      round: m.round,
      matchedAt: m.matched_at,
      reasons: z.array(z.string()).parse(JSON.parse(m.reasons)),
      outcome: m.outcome,
      alum: alumni.get(m.alum_id) ?? null,
    }));
  }

  private async summaries(rows: SummaryRow[], viewer: Viewer): Promise<AlumSummary[]> {
    if (!rows.length) return [];
    const majors = (
      await this.db
        .prepare(
          `SELECT person_id, degree_name, school_name FROM alumni_person_schools
           WHERE kind = 'major' AND person_id IN (${rows.map(() => "?").join(", ")})
           ORDER BY is_primary DESC, degree_name`,
        )
        .bind(...rows.map((row) => row.id))
        .all<{ person_id: string; degree_name: string; school_name: string }>()
    ).results;
    return rows.map((row) => {
      const own = majors.filter((major) => major.person_id === row.id);
      return {
        id: row.id,
        name: row.full_name,
        graduationYear: row.graduation_year,
        majors: own.map((major) => major.degree_name),
        schools: [...new Set(own.map((major) => major.school_name))],
        title: row.job_title,
        employer: row.employer,
        industry: row.industry,
        city: row.city ? cityName(row.city, row.region, row.country ?? "") : null,
        lastCheckedAt: row.last_checked_at,
        ...(viewer.admin && row.listing_status === "hidden" ? { hidden: true as const } : {}),
      };
    });
  }
}
