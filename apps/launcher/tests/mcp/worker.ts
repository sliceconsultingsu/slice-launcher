// Synthetic workerd fixture only; never imported by the production route or registry.
import { createLocalJWKSet } from "jose";
import { verifyIdentity } from "../../src/membership/auth";
import { emptyState, enroll } from "../../src/membership/domain";
import { createMcpAdapter } from "../../src/platform/mcp";

const issuer = "https://test.cloudflareaccess.com";
export default {
  async fetch(request: Request, env: { PUBLIC_JWK: string }) {
    const keys = createLocalJWKSet({ keys: [JSON.parse(env.PUBLIC_JWK)] });
    const state = enroll(
      emptyState(null),
      { subject: `${issuer}|worker-test`, email: "worker@example.test" },
      { id: "worker-test", now: "synthetic" },
    ).state;
    state.members[0].status = "active";
    return createMcpAdapter({
      catalog: [],
      modules: new Map(),
      verify: (req) => verifyIdentity(req, { issuer, audience: "worker-test" }, keys),
      loadState: async () => state,
    })(request);
  },
};
