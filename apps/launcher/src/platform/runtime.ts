import { env } from "cloudflare:workers";
import { verifyIdentity } from "../membership/auth";
import { Repository } from "../membership/repository";
import { apps } from "../lib/apps";
import { modules } from "./registry.generated";
import { createPlatform } from "./dispatch";

export function platform() {
  return createPlatform({
    catalog: apps,
    modules,
    verify: (request) =>
      verifyIdentity(request, {
        issuer: env.ACCESS_TEAM_DOMAIN,
        audience: env.ACCESS_AUD,
      }),
    loadState: () => new Repository(env.MEMBERSHIP_DB).load(),
  });
}
