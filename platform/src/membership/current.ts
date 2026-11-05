// Production wiring for Slice's own sign-in: who is signed in on this browser, and the Google
// sign-in settings. Membership and permissions are still loaded separately on every request.
import { env } from "cloudflare:workers";
import type { Identity } from "./contracts";
import type { GoogleEnv } from "./google";
import { sessionIdentity } from "./session";

export function identify(request: Request): Promise<Identity> {
  return sessionIdentity(request, env.MEMBERSHIP_DB);
}

export function googleEnv(): GoogleEnv {
  return {
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    // A Worker secret (wrangler secret put); not in wrangler.jsonc, so not in the generated type.
    GOOGLE_CLIENT_SECRET:
      (env as unknown as { GOOGLE_CLIENT_SECRET?: string }).GOOGLE_CLIENT_SECRET ?? "",
    ALLOWED_EMAIL_DOMAIN: env.ALLOWED_EMAIL_DOMAIN,
    LEGACY_ACCESS_ISSUER: env.LEGACY_ACCESS_ISSUER,
    AUTH_LIMITER: env.AUTH_LIMITER,
    MEMBERSHIP_DB: env.MEMBERSHIP_DB,
  };
}
