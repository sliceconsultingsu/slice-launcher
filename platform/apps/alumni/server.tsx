import type { AppModule } from "../../src/platform/contracts";
import { alumniApi } from "./api";
import { openAlumniData } from "./data/database";
import { refreshTools } from "./refresh/tools";
import { DirectoryView } from "./ui/directory";

export default {
  tools: refreshTools(openAlumniData),
  Page({ context }) {
    context.requirePermission("records.read");
    return <DirectoryView />;
  },
  api: (props) => alumniApi(props, openAlumniData),
} satisfies AppModule;
