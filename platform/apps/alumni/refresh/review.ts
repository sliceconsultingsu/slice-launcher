// What the review page shows and does. Nothing changes an alum's profile without an admin: a
// proposal filed by the refresh waits here until a person approves or rejects it.
import { cityName } from "../data/reads";
import type { AlumniData } from "../data/services";

export interface ProposalView {
  id: string;
  personId: string;
  name: string;
  /** What kind of change this is, in words. */
  change: "New current job" | "Job title correction" | "Change";
  /** The value on the profile when the proposal was made, in words; null when there was none. */
  current: string | null;
  proposed: string;
  /** Where the suggestion came from. */
  source: string;
  /** When the source was read. */
  foundAt: string;
}

/** Pending proposals for alumni profiles, oldest first. Admins only: the caller checks. */
export async function pendingProposals(data: AlumniData): Promise<ProposalView[]> {
  const [proposals, employers, industries, locations] = await data.db.batch<
    Record<string, string | null>
  >([
    data.db.prepare(
      `SELECT c.id, c.record_id, c.field, c.current_value, c.proposed_value, c.source, c.found_at, p.full_name
       FROM alumni_pending_changes c JOIN alumni_people p ON p.id = c.record_id
       WHERE c.status = 'pending' AND c.entity = 'alumni_profile'
       ORDER BY c.found_at, c.id LIMIT 200`,
    ),
    data.db.prepare("SELECT id, name FROM alumni_employers"),
    data.db.prepare("SELECT id, name FROM alumni_industries"),
    data.db.prepare("SELECT id, city, region, country FROM alumni_locations"),
  ]);
  const names = (rows: Record<string, string | null>[] | undefined) =>
    new Map((rows ?? []).map((row) => [row.id ?? "", row.name ?? ""]));
  const employerNames = names(employers?.results);
  const industryNames = names(industries?.results);
  const cityNames = new Map(
    (locations?.results ?? []).map((row) => [
      row.id ?? "",
      cityName(row.city ?? "", row.region, row.country ?? ""),
    ]),
  );
  const jobInWords = (json: string): string => {
    const job = JSON.parse(json) as Record<string, string | null>;
    return [
      `${job.title ?? "Unknown title"} at ${employerNames.get(job.employerId ?? "") ?? "an unknown employer"}`,
      industryNames.get(job.industryId ?? ""),
      job.locationId ? cityNames.get(job.locationId) : undefined,
      job.startMonth ? `since ${job.startMonth}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const inWords = (field: string | null, value: string | null) =>
    value === null ? null : field === "current_job" ? jobInWords(value) : value;
  return (proposals?.results ?? []).map((row) => ({
    id: row.id ?? "",
    personId: row.record_id ?? "",
    name: row.full_name ?? "",
    change:
      row.field === "current_job"
        ? "New current job"
        : row.field === "job_title"
          ? "Job title correction"
          : "Change",
    current: inWords(row.field, row.current_value),
    proposed: inWords(row.field, row.proposed_value) ?? "",
    source: row.source ?? "",
    foundAt: row.found_at ?? "",
  }));
}
