import type { AppModule } from "../../src/platform/contracts";
import { alumniApi } from "./api";
import { openMailer } from "./confirmation/runtime";
import { openAlumniData } from "./data/database";
import { studentTools } from "./mcp/tools";
import { refreshTools } from "./refresh/tools";
import { AlumniApp } from "./ui/app";

/** Pages only a Slice admin may open. Their API routes check the same permission again. */
const ADMIN_PAGES = new Set(["manage", "review", "add", "confirm"]);

export default {
  tools: [...studentTools(openAlumniData), ...refreshTools(openAlumniData)],
  Page({ context, path }) {
    context.requirePermission("records.read");
    const recordingReply = path[0] === "alumni" && path[2] === "reply";
    if ((path[0] && ADMIN_PAGES.has(path[0])) || recordingReply) context.requirePermission("admin");
    return <AlumniApp path={path} />;
  },
  api: (props) => alumniApi(props, openAlumniData, openMailer),
} satisfies AppModule;
