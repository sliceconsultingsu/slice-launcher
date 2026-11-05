import { defineConfig } from "@playwright/test";
import { workspacePort } from "./workspace-ports";
const port = workspacePort(100, 4173);
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm test:e2e:server",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
