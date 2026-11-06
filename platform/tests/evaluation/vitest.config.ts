// Evaluation-only Vitest config from the 2026-10-16 readiness review
// (docs/evaluations/2026-10-16-platform-readiness.md). It reuses the platform settings but runs only
// tests/evaluation, so these files never join the CI `src/**` and `apps/**` globs.
// Run from platform/: pnpm exec vitest run --config tests/evaluation/vitest.config.ts
// `it.fails` marks a known defect: it passes while the defect exists and fails once it is fixed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    ...base.test,
    include: ["tests/evaluation/**/*.test.ts"],
    coverage: { enabled: false },
    hookTimeout: 60_000,
  },
});
