import type { AppModule } from "../../src/platform/contracts";
import { StatusReportsPage } from "./page";

/** Read-only instructions. No API, no MCP tools and no storage: the app holds no client data. */
export default {
  Page({ context }) {
    context.requirePermission("use");
    return <StatusReportsPage />;
  },
} satisfies AppModule;
