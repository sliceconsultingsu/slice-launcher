import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkAppScripts } from "./check-workspace.mjs";

const scripts = Object.fromEntries(
  ["lint", "typecheck", "test", "build"].map((name) => [name, "tool run"]),
);

function fixture(t, manifest) {
  const root = mkdtempSync(join(tmpdir(), "slice-workspace-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "platform"), { recursive: true });
  writeFileSync(join(root, "platform", "package.json"), JSON.stringify(manifest));
  writeFileSync(
    join(root, "platform", "README.md"),
    "## Configuration\n## Permissions\n## Deployment\n## Testing\n",
  );
  return root;
}

test("accepts the platform with every required quality check", (t) => {
  assert.deepEqual(checkAppScripts(fixture(t, { scripts })), []);
});

test("rejects the platform that silently omits tests or type checking", (t) => {
  const errors = checkAppScripts(
    fixture(t, { scripts: { lint: "eslint .", build: "vite build" } }),
  );
  assert.equal(errors.length, 2);
  assert.ok(errors.some((error) => error.includes("typecheck")));
  assert.ok(errors.some((error) => error.includes("test")));
});

test("rejects blank commands instead of treating them as checks", (t) => {
  assert.equal(checkAppScripts(fixture(t, { scripts: { ...scripts, test: " " } })).length, 1);
});

test("requires operational documentation for the platform", (t) => {
  const root = fixture(t, { scripts });
  writeFileSync(join(root, "platform", "README.md"), "## Configuration\n");
  assert.equal(checkAppScripts(root).length, 3);
});
