import { env } from "cloudflare:workers";
import { verifyIdentity } from "../membership/auth";
import { Repository } from "../membership/repository";
import { apps } from "../lib/apps";
import { modules } from "./registry.generated";
import { createPlatform } from "./dispatch";
import { createMcpAdapter } from "./mcp";

export function platform() {
  const dependencies = {
    catalog: apps,
    modules,
    verify: (request: Request) =>
      verifyIdentity(request, {
        issuer: env.ACCESS_TEAM_DOMAIN,
        audience: env.ACCESS_AUD,
      }),
    loadState: () => new Repository(env.MEMBERSHIP_DB).load(),
  };
  return { ...createPlatform(dependencies), mcp: createMcpAdapter(dependencies) };
}
