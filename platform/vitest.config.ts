import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  resolve: {
    // The OAuth library imports WorkerEntrypoint from the Workers runtime; unit tests run in Node.
    alias: {
      "cloudflare:workers": new URL("./tests/stubs/cloudflare-workers.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    environment: "node",
    // Bundle the OAuth library so the cloudflare:workers alias above applies to it.
    server: { deps: { inline: ["@cloudflare/workers-oauth-provider"] } },
    include: ["src/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/membership/{auth,api,app-access,domain,repository,contracts,session,google}.ts",
        "src/platform/{access,dispatch,mcp,mcp-tool}.ts",
        // oauth.ts is left out: its tests run it inside Miniflare, which V8 here cannot measure.
        "src/ai-connections/{activity,connections,consent,status}.ts",
      ],
      reporter: ["text", "json-summary", "html"],
      // Per-module floors from measured authorization scenarios; see docs/testing.md.
      thresholds: {
        "src/membership/auth.ts": { statements: 88, branches: 90, functions: 100, lines: 87 },
        "src/membership/api.ts": { statements: 94, branches: 86, functions: 100, lines: 93 },
        "src/membership/domain.ts": { statements: 99, branches: 94, functions: 100, lines: 99 },
        // Who can open and who runs each app.
        "src/membership/app-access.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/membership/repository.ts": {
          statements: 96,
          branches: 91,
          functions: 100,
          lines: 100,
        },
        // The production sign-in path: Slice sessions and Google sign-in.
        "src/membership/session.ts": { statements: 100, branches: 94, functions: 100, lines: 100 },
        "src/membership/google.ts": { statements: 92, branches: 86, functions: 100, lines: 96 },
        // Guarded dispatch for apps and AI tools.
        "src/platform/access.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/platform/dispatch.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/platform/mcp-tool.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/platform/mcp.ts": { statements: 92, branches: 88, functions: 81, lines: 93 },
        // AI connection approval, listing and removal.
        "src/ai-connections/consent.ts": {
          statements: 94,
          branches: 83,
          functions: 100,
          lines: 97,
        },
        "src/ai-connections/connections.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/ai-connections/status.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/ai-connections/activity.ts": {
          statements: 95,
          branches: 90,
          functions: 87,
          lines: 100,
        },
      },
    },
  },
});
