import { z } from "zod";

const text = z.string().trim().min(1).max(120);
const topics = z.array(text).max(12);
export const alumniSchema = z.strictObject({
  id: z.string().regex(/^alum-[a-z0-9-]{1,40}$/),
  name: text,
  graduationYear: z.number().int().min(1950).max(2100),
  company: text,
  role: text,
  industry: text,
  expertise: topics,
  lastVerifiedAt: z.iso.datetime(),
});
export const studentSchema = z.strictObject({
  id: z.string().regex(/^student-[a-z0-9-]{1,40}$/),
  name: text,
  graduationYear: z.number().int().min(1950).max(2100),
  interests: topics,
  goals: z.string().trim().min(1).max(500),
});
export const directorySchema = z.strictObject({
  dataset: z.literal("synthetic"),
  alumni: z.array(alumniSchema).max(100),
  students: z.array(studentSchema).max(100),
});
export type Alumnus = z.infer<typeof alumniSchema>;
export type Student = z.infer<typeof studentSchema>;
export type Directory = z.infer<typeof directorySchema>;

/** Draft team contract. Final ranking and pairing policy need client agreement. */
export interface MatchResult {
  studentId: string;
  alumniId: string;
  reasons: string[];
}
/** Proposed changes only: this contract does not authorize a database write. */
export interface RefreshProposal {
  alumniId: string;
  sourceUrl: string;
  retrievedAt: string;
  changes: Partial<Pick<Alumnus, "company" | "role" | "industry" | "expertise">>;
  status: "needs-review";
}
export interface AlumniRepository {
  listAlumni(): Promise<Alumnus[]>;
  listStudents(): Promise<Student[]>;
}
