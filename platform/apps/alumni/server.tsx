import type { AppModule } from "../../src/platform/contracts";
import { alumniApi } from "./api";
import { openAlumniData } from "./data/database";
import { studentTools } from "./mcp/tools";
import { refreshTools } from "./refresh/tools";
import { DirectoryView } from "./ui/directory";

export default {
  tools: [...studentTools(openAlumniData), ...refreshTools(openAlumniData)],
  Page({ context }) {
    context.requirePermission("records.read");
    return <DirectoryView />;
  },
  api: (props) => alumniApi(props, openAlumniData),
} satisfies AppModule;
