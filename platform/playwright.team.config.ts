import { defineConfig } from "@playwright/test";
import { workspacePort } from "./workspace-ports";
const port = workspacePort(200, 4399);
export default defineConfig({
  testDir: "tests/team",
  testMatch: "*.spec.ts",
  workers: 1,
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    command: `tsx tests/team/server.ts --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
