// Production wiring for the connected-apps routes: Access identity, membership D1 and OAuth KV.
import { env } from "cloudflare:workers";
import { verifyIdentity } from "../membership/auth";
import { Repository } from "../membership/repository";
import { ActivityStore } from "./activity";
import type { ConnectionDeps } from "./connections";
import { oauthHelpers } from "./oauth";

export function identify(request: Request) {
  return verifyIdentity(request, { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
}

export function connectionDeps(request: Request): ConnectionDeps {
  return {
    helpers: oauthHelpers(env, new URL(request.url).origin),
    activity: new ActivityStore(env.OAUTH_KV),
    loadState: () => new Repository(env.MEMBERSHIP_DB).load(),
    // Typed as the configured literal; compare as a string so "true" can switch it on.
    enabled: String(env.AI_CONNECTIONS_ENABLED) === "true",
  };
}
