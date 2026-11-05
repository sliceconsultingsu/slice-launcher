import { env } from "cloudflare:workers";
import { authorize } from "../../src/ai-connections/consent";
import { oauthHelpers } from "../../src/ai-connections/oauth";
import { verifyIdentity } from "../../src/membership/auth";
import { Repository } from "../../src/membership/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Behind Cloudflare Access: the person is already signed in when this page loads.
async function handle(request: Request) {
  return authorize(request, {
    helpers: oauthHelpers(env, new URL(request.url).origin),
    identify: (req) =>
      verifyIdentity(req, { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD }),
    loadState: () => new Repository(env.MEMBERSHIP_DB).load(),
  });
}
export { handle as GET, handle as POST };
