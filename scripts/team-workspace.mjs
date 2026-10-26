import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import process from "node:process";
import console from "node:console";

try {
  const [
    command,
    slot,
    parent,
    ref = "main",
    source = "https://github.com/sliceconsultingsu/slice-launcher.git",
    ...extra
  ] = process.argv.slice(2);
  if (command !== "create" || !/^[1-5]$/.test(slot ?? "") || !parent || extra.length)
    throw new Error(
      "Usage: pnpm team:workspace create <1-5> <parent-directory> [branch] [source-repository]",
    );
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) || ref.includes(".."))
    throw new Error("Use a branch name, not a Git option.");
  if (source.startsWith("-") || /[\r\n\0]/.test(source))
    throw new Error("Invalid source repository.");
  const destination = join(resolve(parent), `person-${slot}`);
  if (existsSync(destination))
    throw new Error(`Workspace already exists: ${destination}. Nothing was overwritten.`);
  mkdirSync(resolve(parent), { recursive: true });
  // Clone committed files only, with a separate Git database. Never copy a maintainer's checkout.
  execFileSync("git", ["clone", "--no-local", "--branch", ref, "--", source, destination], {
    stdio: "pipe",
  });
  execFileSync("git", ["switch", "-c", `work/person-${slot}/first-task`], {
    cwd: destination,
    stdio: "pipe",
  });
  const port = 4310 + Number(slot);
  appendFileSync(join(destination, ".git/info/exclude"), "\n.slice-workspace.json\n");
  writeFileSync(
    join(destination, ".slice-workspace.json"),
    JSON.stringify({ slot: Number(slot), port }, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    `Created ${destination}\nPreview port: ${port}\nNext: open this workspace, run corepack pnpm install --frozen-lockfile, then corepack pnpm team:dev.\nRemote access: forward local port ${port} to 127.0.0.1:${port} on your approved development host.\nNo user account, credentials, dependencies or background server were provisioned.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
