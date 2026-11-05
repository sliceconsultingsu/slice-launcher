// Production wiring for the connected-apps routes: Slice session, membership D1 and OAuth KV.
import { env } from "cloudflare:workers";
import { Repository } from "../membership/repository";
import { ActivityStore } from "./activity";
import type { ConnectionDeps } from "./connections";
import { aiConnectionsEnabled } from "./enabled";
import { oauthHelpers } from "./oauth";

export { identify } from "../membership/current";

export function connectionDeps(request: Request): ConnectionDeps {
  return {
    helpers: oauthHelpers(env, new URL(request.url).origin),
    activity: new ActivityStore(env.OAUTH_KV),
    loadState: () => new Repository(env.MEMBERSHIP_DB).load(),
    enabled: aiConnectionsEnabled(),
  };
}
