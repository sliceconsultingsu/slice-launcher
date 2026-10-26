import process from "node:process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const script = new URL("./team-workspace.mjs", import.meta.url);
test("creates separate branches and ports without copying private or untracked files", () => {
  const root = mkdtempSync(join(tmpdir(), "slice-team-"));
  try {
    const source = join(root, "source");
    mkdirSync(source);
    const git = (...args) => execFileSync("git", args, { cwd: source, stdio: "pipe" });
    git("init", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.test");
    writeFileSync(join(source, "README.md"), "Fixture");
    git("add", ".");
    git("commit", "-m", "fixture");
    git("switch", "-c", "starter");
    writeFileSync(join(source, ".env"), "PRIVATE_FIXTURE=not-for-copying");
    const output = join(root, "team");
    for (const slot of [1, 2]) {
      const result = spawnSync(
        process.execPath,
        [script.pathname, "create", String(slot), output, "starter", source],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      const directory = join(output, `person-${slot}`);
      assert.equal(existsSync(join(directory, ".env")), false);
      execFileSync("git", ["fetch", "origin"], { cwd: directory, stdio: "pipe" });
      execFileSync("git", ["rev-parse", "--verify", "origin/main"], {
        cwd: directory,
        stdio: "pipe",
      });
      assert.equal(
        JSON.parse(readFileSync(join(directory, ".slice-workspace.json"))).port,
        4310 + slot,
      );
      assert.equal(
        execFileSync("git", ["branch", "--show-current"], {
          cwd: directory,
          encoding: "utf8",
        }).trim(),
        `work/person-${slot}/first-task`,
      );
      assert.equal(
        execFileSync("git", ["status", "--porcelain"], { cwd: directory, encoding: "utf8" }).trim(),
        "",
      );
    }
    writeFileSync(join(output, "person-1", "README.md"), "One person's changes");
    assert.equal(readFileSync(join(output, "person-2", "README.md"), "utf8"), "Fixture");
    const again = spawnSync(
      process.execPath,
      [script.pathname, "create", "1", output, "starter", source],
      { encoding: "utf8" },
    );
    assert.notEqual(again.status, 0);
    assert.equal(
      readFileSync(join(output, "person-1", "README.md"), "utf8"),
      "One person's changes",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("rejects invalid slots and option-like refs before creating a destination", () => {
  const root = mkdtempSync(join(tmpdir(), "slice-team-invalid-"));
  try {
    for (const args of [
      ["6", root, "main"],
      ["../escape", root, "main"],
      ["1", root, "--upload-pack=bad"],
    ]) {
      const result = spawnSync(process.execPath, [script.pathname, "create", ...args], {
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(join(root, "person-1")), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
