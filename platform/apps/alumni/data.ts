import type { AppContext } from "../../src/platform/contracts";
import type { AlumniRepository, Directory } from "./contracts";
import { directorySchema } from "./contracts";
import { sampleDirectory } from "./fixtures";

/** Read-only teaching adapter. Each instance owns a separate copy of the examples. */
export function createSampleRepository(): AlumniRepository {
  const data = structuredClone(sampleDirectory);
  return {
    listAlumni: async () => structuredClone(data.alumni),
    listStudents: async () => structuredClone(data.students),
  };
}
export async function readDirectory(
  context: AppContext,
  repository: AlumniRepository,
): Promise<Directory> {
  context.requirePermission("records.read");
  const [alumni, students] = await Promise.all([
    repository.listAlumni(),
    repository.listStudents(),
  ]);
  return directorySchema.parse({ dataset: "synthetic", alumni, students });
}
