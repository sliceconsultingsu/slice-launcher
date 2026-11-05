// Slice's Worker entry. vinext serves every page and API; the Slice OAuth provider sits in front
// of it to serve AI sign-in (/mcp, /oauth/*, /.well-known/oauth-*), which bypasses Cloudflare
// Access and accepts only Slice-issued passes. Everything else reaches vinext unchanged.
import vinext from "vinext/server/fetch-handler";
import { createSliceWorker } from "../src/ai-connections/oauth";
import { apps } from "../src/lib/apps";
import { Repository } from "../src/membership/repository";
import { createMcpAdapter } from "../src/platform/mcp";
import { modules } from "../src/platform/registry.generated";

export default createSliceWorker<CloudflareEnv>({
  defaultHandler: {
    fetch: (request, env, ctx) => vinext.fetch(request, env, ctx),
  },
  // The same adapter the platform used before, with the identity taken from the grant instead of
  // an Access header. It reloads current membership on every request.
  mcp: (request, identity, env) =>
    createMcpAdapter({
      catalog: apps,
      modules,
      verify: async () => identity,
      loadState: () => new Repository(env.MEMBERSHIP_DB).load(),
    })(request),
});
