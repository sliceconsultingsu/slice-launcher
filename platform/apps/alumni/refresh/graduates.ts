// Turns graduated students into alumni. There is no calendar trigger because the platform has no
// scheduler: this runs when an admin's assistant calls the tool at the start of a refresh run.
import type { AlumniData } from "../data/services";
import { GRADUATION_CUTOFF, LIST_LIMIT } from "./config";

/**
 * A person is ready when their record is not merged away, they have a student profile and no
 * alumni profile, and today is on or after the cutoff date of their graduation year. The database
 * stores a year, not a date, so everyone in a class graduates on the same day.
 */
export async function refreshGraduates(data: AlumniData) {
  const today = data.now().slice(0, 10);
  const ready = (
    await data.db
      .prepare(
        `SELECT p.id, p.full_name
         FROM alumni_people p
         JOIN alumni_student_profiles sp ON sp.person_id = p.id
         WHERE p.merged_into IS NULL
           AND NOT EXISTS (SELECT 1 FROM alumni_profiles ap WHERE ap.person_id = p.id)
           AND (p.graduation_year || '-' || ?) <= ?
         ORDER BY p.graduation_year, p.id LIMIT ?`,
      )
      .bind(GRADUATION_CUTOFF, today, LIST_LIMIT)
      .all<{ id: string; full_name: string }>()
  ).results;
  const graduated: { personId: string; fullName: string }[] = [];
  for (const person of ready)
    if (await data.store.graduateStudent(person.id))
      graduated.push({ personId: person.id, fullName: person.full_name });
  return { graduated };
}
