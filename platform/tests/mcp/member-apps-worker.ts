// Synthetic workerd fixture only; never imported by the production route or registry. It runs
// the launcher's AI connection with member apps on, against a real D1 database, so that an app's
// tools (their input descriptions are data, checked at run time) are exercised in the runtime
// Cloudflare runs, where code cannot be generated from text.
import { createLocalJWKSet } from "jose";
import { MemberApps } from "../../src/member-apps/service";
import { verifyIdentity } from "../../src/membership/auth";
import { enroll } from "../../src/membership/domain";
import { Repository } from "../../src/membership/repository";
import { createMcpAdapter } from "../../src/platform/mcp";
import { memoryFiles } from "../member-apps/memory-files";

const issuer = "https://test.cloudflareaccess.com";
const files = memoryFiles();
export default {
  async fetch(request: Request, env: { PUBLIC_JWK: string; DB: D1Database }) {
    const keys = createLocalJWKSet({ keys: [JSON.parse(env.PUBLIC_JWK)] });
    const repository = new Repository(env.DB);
    // The one test person is the organization's owner, so they are active as soon as they join.
    const state = await repository.load();
    const joined = enroll(
      state,
      { subject: `${issuer}|worker-test`, email: "worker@example.test", emailManaged: true },
      { id: "worker-test", now: "2026-11-26T00:00:00Z" },
    );
    if (joined.audit) await repository.commit(state, { ...joined, audit: joined.audit });
    return createMcpAdapter({
      catalog: [],
      modules: new Map(),
      verify: (req) => verifyIdentity(req, { issuer, audience: "worker-test" }, keys),
      loadState: () => repository.load(),
      memberApps: new MemberApps({
        repository,
        files,
        origin: "https://slice.example",
        cloud: { ensureDatabase: async () => "db-test", uploadServer: async () => {} },
        // A stand-in for the app's own server code: it says what it was asked, and by whom.
        server: () => ({
          fetch: async (asked) =>
            Response.json({
              path: new URL(asked.url).pathname,
              input: await asked.json(),
              member: asked.headers.get("X-Slice-Member-Id"),
            }),
        }),
      }),
    })(request);
  },
};
