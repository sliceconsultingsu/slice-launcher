import { env } from "cloudflare:workers";
import { authorize } from "../../src/ai-connections/consent";
import { oauthHelpers } from "../../src/ai-connections/oauth";
import { identify } from "../../src/membership/current";
import { Repository } from "../../src/membership/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The Slice session says who is signing in; without one, the page starts Google sign-in.
async function handle(request: Request) {
  return authorize(request, {
    helpers: oauthHelpers(env, new URL(request.url).origin),
    identify,
    loadState: () => new Repository(env.MEMBERSHIP_DB).load(),
  });
}
export { handle as GET, handle as POST };
