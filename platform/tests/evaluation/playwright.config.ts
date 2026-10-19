import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Evaluation-only browser suite (consultant/administrator journeys, layout, keyboard, axe).
// It lives outside tests/e2e so the CI browser job never runs it. It reuses the synthetic
// harness server: in-memory D1, real migrations and per-run signed synthetic identities.
const platform = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: "*.eval.spec.ts",
  outputDir: "../../test-results/evaluation/playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "../../test-results/evaluation/report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    // Traces would contain the synthetic identity headers; keep diagnostics to screenshots.
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm test:e2e:server",
    cwd: platform,
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
