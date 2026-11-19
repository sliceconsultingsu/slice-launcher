// Slice's Worker entry. vinext serves every page and API; the Slice OAuth provider sits in front
// of it to serve AI sign-in (/mcp, /oauth/*, /.well-known/oauth-*), which accepts only
// Slice-issued passes. Everything else reaches vinext unchanged.
import vinext from "vinext/server/fetch-handler";
import { createSliceWorker } from "../src/ai-connections/oauth";
import { apps } from "../src/lib/apps";
import { memberAppRequest, memberAppsService } from "../src/member-apps/runtime";
import { Repository } from "../src/membership/repository";
import { createMcpAdapter } from "../src/platform/mcp";
import { modules } from "../src/platform/registry.generated";

export default createSliceWorker<CloudflareEnv>({
  defaultHandler: {
    fetch: (request, env, ctx) => vinext.fetch(request, env, ctx),
  },
  // The same adapter the platform used before, with the identity taken from the grant instead of
  // a browser session. It reloads current membership on every request.
  mcp: (request, identity, env) =>
    createMcpAdapter({
      catalog: apps,
      modules,
      verify: async () => identity,
      loadState: () => new Repository(env.MEMBERSHIP_DB).load(),
      memberApps: memberAppsService(request, env),
    })(request),
  // Member apps live at their own addresses under the launcher's (docs/member-apps.md).
  memberApp: (request, env, appId) => memberAppRequest(request, env, appId),
  // Passes are issued and renewed only for people who are active members at that moment.
  loadState: (env) => new Repository(env.MEMBERSHIP_DB).load(),
});
