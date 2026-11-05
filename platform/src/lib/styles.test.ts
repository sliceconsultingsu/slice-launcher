import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const stylesheet = resolve(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css");

// Tailwind silently skips a missing @source folder, which once left every shared component
// unstyled in production after the platform folder moved. Fail loudly instead.
it("points Tailwind at folders that exist, including the shared UI package", () => {
  const sources = [...readFileSync(stylesheet, "utf8").matchAll(/@source\s+"([^"]+)"/g)].map(
    (match) => resolve(dirname(stylesheet), match[1]),
  );
  expect(sources).toContain(resolve(dirname(stylesheet), "../../packages/ui/src"));
  for (const source of sources) expect(existsSync(source), source).toBe(true);
});
