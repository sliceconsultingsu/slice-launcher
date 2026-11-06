// Synthetic workerd fixture only; never imported by the production Worker or registry.
// It runs the real Slice OAuth Worker with an in-memory member list and a test-only /authorize
// that approves the synthetic member directly (the real approval page has its own tests).
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { emptyState, enroll } from "../../src/membership/domain";
import type { State } from "../../src/membership/contracts";
import { createMcpAdapter } from "../../src/platform/mcp";
import { createSliceWorker, grantUserId, SCOPE } from "../../src/ai-connections/oauth";
import { ActivityStore } from "../../src/ai-connections/activity";

const subject = "https://test.cloudflareaccess.com|ai-test";
const email = "ai@example.test";

function initialState(): State {
  const state = enroll(
    emptyState(null),
    { subject, email, emailManaged: true },
    { id: "ai-test", now: "synthetic" },
  ).state;
  state.members[0].status = "active";
  return state;
}
let state = initialState();

type FixtureEnv = { OAUTH_KV: KVNamespace; OAUTH_LIMITER: RateLimit; OAUTH_PROVIDER: OAuthHelpers };

const defaultHandler = {
  async fetch(request: Request, env: FixtureEnv) {
    const url = new URL(request.url);
    if (url.pathname === "/__test/member" && request.method === "POST") {
      Object.assign(state.members[0], await request.json());
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/__test/reset" && request.method === "POST") {
      state = initialState();
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/__test/activity") {
      const userId = await grantUserId(subject);
      const grants = await env.OAUTH_PROVIDER.listUserGrants(userId);
      const store = new ActivityStore(env.OAUTH_KV);
      return Response.json(
        await Promise.all(
          grants.items.map(async (grant) => ({
            id: grant.id,
            ...(await store.get(userId, grant.id)),
          })),
        ),
      );
    }
    if (url.pathname === "/__test/revoke" && request.method === "POST") {
      const userId = await grantUserId(subject);
      const grants = await env.OAUTH_PROVIDER.listUserGrants(userId);
      for (const grant of grants.items) await env.OAUTH_PROVIDER.revokeGrant(grant.id, userId);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/authorize") {
      const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      const description = await env.OAUTH_PROVIDER.describeConsent(authRequest);
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: authRequest,
        userId: await grantUserId(subject),
        scope: [SCOPE],
        props: { subject, email, clientId: authRequest.clientId },
        metadata: { clientName: description.clientName },
      });
      return Response.redirect(redirectTo, 302);
    }
    return new Response("Not found", { status: 404 });
  },
};

export default createSliceWorker({
  defaultHandler,
  mcp: (request, identity) =>
    createMcpAdapter({
      catalog: [],
      modules: new Map(),
      verify: async () => identity,
      loadState: async () => structuredClone(state),
    })(request),
});
