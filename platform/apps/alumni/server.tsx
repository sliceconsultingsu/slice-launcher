import type { AppModule } from "../../src/platform/contracts";
import { DirectoryView } from "./ui/directory";
import { createSampleRepository, readDirectory } from "./data";

const repository = createSampleRepository();
export default {
  Page({ context }) {
    context.requirePermission("records.read");
    return <DirectoryView />;
  },
  async api({ context, path, method }) {
    context.requirePermission("records.read");
    if (path.length !== 1 || path[0] !== "records")
      return Response.json({ error: "Operation not found." }, { status: 404 });
    if (method !== "GET" && method !== "HEAD")
      return Response.json(
        { error: "This starter is read-only. No records were changed." },
        { status: 405, headers: { Allow: "GET, HEAD" } },
      );
    return Response.json(await readDirectory(context, repository));
  },
} satisfies AppModule;
