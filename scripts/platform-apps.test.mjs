import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, syncApps, checkApps } from "./platform-apps.mjs";
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "slice-platform-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, "apps/launcher/src/platform");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "catalog.json"), "[]\n");
  await syncApps(root);
  return root;
}
test("new apps inherit the host without a Worker config or deployment workflow", async (t) => {
  const root = await fixture(t);
  await createApp(root, "alumni", "Alumni directory");
  await checkApps(root);
  const source = readFileSync(join(root, "apps/launcher/src/apps/alumni/server.tsx"), "utf8");
  assert.match(source, /context.member/);
  assert.doesNotMatch(source, /wrangler|verifyIdentity/);
  await assert.rejects(createApp(root, "alumni"), /already exists/);
  await assert.rejects(createApp(root, "../escape"), /lowercase app ID/);
});
test("CI rejects stale registry, unknown modules and independent deployments", async (t) => {
  const root = await fixture(t);
  await createApp(root, "alumni");
  const registry = join(root, "apps/launcher/src/platform/registry.generated.ts");
  writeFileSync(registry, "// missing registry\n");
  await assert.rejects(checkApps(root), /registry is stale/);
  await syncApps(root);
  const rogue = join(root, "apps/separate-worker");
  mkdirSync(rogue);
  await assert.rejects(checkApps(root), /one platform deployment/);
  rmSync(rogue, { recursive: true });
  mkdirSync(join(root, "apps/launcher/src/apps/unregistered"));
  await assert.rejects(checkApps(root), /registered in the catalog/);
});
test("CI rejects independent server actions and app deployment configuration", async (t) => {
  const root = await fixture(t);
  await createApp(root, "alumni");
  const dir = join(root, "apps/launcher/src/apps/alumni");
  writeFileSync(join(dir, "action.ts"), 'export async function mutate() { "use server"; }');
  await assert.rejects(checkApps(root), /guarded platform API/);
  rmSync(join(dir, "action.ts"));
  writeFileSync(join(dir, "wrangler.jsonc"), "{}");
  await assert.rejects(checkApps(root), /deployment and dependencies/);
});
test("catalog rejects external URLs, duplicate IDs and permission collisions", async (t) => {
  const root = await fixture(t);
  const file = join(root, "apps/launcher/src/platform/catalog.json");
  const app = { id: "alumni", name: "Alumni", description: "", permissions: [] };
  for (const value of [
    [{ ...app, url: "https://external.test" }],
    [app, app],
    [{ ...app, permissions: [{ id: "open", label: "Again" }] }],
  ]) {
    writeFileSync(file, JSON.stringify(value));
    await assert.rejects(syncApps(root));
  }
});

test("CI rejects app routes shadowing the central permission guard", async (t) => {
  const root = await fixture(t);
  const directory = join(root, "apps/launcher/app/apps/alumni");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "page.tsx"), "export default () => 'private';");
  await assert.rejects(checkApps(root), /direct routes can bypass/);
});

test("apps inherit the MCP adapter instead of creating their own servers or transports", async (t) => {
  const root = await fixture(t);
  await createApp(root, "notes");
  const file = join(root, "apps/launcher/src/apps/notes/mcp.ts");
  for (const source of [
    'import {McpServer} from "@modelcontextprotocol/server";',
    'export {McpServer} from "@modelcontextprotocol/server";',
    'const sdk = await import("@modelcontextprotocol/server");',
  ]) {
    writeFileSync(file, source);
    await assert.rejects(checkApps(root), /MCP servers and transports belong to the platform/);
  }
  rmSync(file);
  const rogue = join(root, "apps/launcher/app/mcp/notes");
  mkdirSync(rogue, { recursive: true });
  writeFileSync(join(rogue, "route.ts"), "export const POST = () => new Response();");
  await assert.rejects(checkApps(root), /direct routes can bypass/);
});
