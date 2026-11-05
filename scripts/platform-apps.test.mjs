import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, syncApps, checkApps } from "./platform-apps.mjs";
import { ICON_README_PLACEHOLDER } from "./app-identity.mjs";

const ownIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a7"/></svg>';
/** Replaces the scaffold placeholders the way a contributor would before review. */
async function finishIdentity(root, id) {
  const dir = join(root, "platform/apps", id);
  writeFileSync(join(dir, "icon.svg"), ownIcon);
  writeFileSync(join(dir, "guide.md"), `# ${id}\n\nUse ${id} to record client notes.\n`);
  const readme = join(dir, "README.md");
  writeFileSync(
    readme,
    readFileSync(readme, "utf8").replace(ICON_README_PLACEHOLDER, "Original artwork, MIT."),
  );
  await syncApps(root);
}
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "slice-platform-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, "platform/src/platform");
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, "platform/apps"), { recursive: true });
  await syncApps(root);
  return root;
}
test("new apps inherit the host without a Worker config or deployment workflow", async (t) => {
  const root = await fixture(t);
  await createApp(root, "alumni", "Alumni directory");
  await assert.rejects(checkApps(root), /starter icon/);
  await finishIdentity(root, "alumni");
  await checkApps(root);
  const source = readFileSync(join(root, "platform/apps/alumni/server.tsx"), "utf8");
  assert.match(source, /context.member/);
  assert.doesNotMatch(source, /wrangler|verifyIdentity/);
  assert.match(source, /\.\.\/\.\.\/src\/platform\/contracts/);
  assert.match(
    readFileSync(join(root, "platform/apps/alumni/README.md"), "utf8"),
    /Access and data/,
  );
  const settings = join(root, "platform/apps/alumni/app.json");
  const app = JSON.parse(readFileSync(settings, "utf8"));
  app.name = "Updated alumni directory";
  writeFileSync(settings, JSON.stringify(app));
  await assert.rejects(checkApps(root), /catalog is stale/);
  await syncApps(root);
  await checkApps(root);
  assert.equal(
    JSON.parse(readFileSync(join(root, "platform/src/platform/catalog.generated.json"), "utf8"))[0]
      .name,
    app.name,
  );
  await assert.rejects(createApp(root, "alumni"), /already exists/);
  await assert.rejects(createApp(root, "../escape"), /lowercase app ID/);
});
test("CI rejects stale registry, unknown modules and independent deployments", async (t) => {
  const root = await fixture(t);
  await createApp(root, "alumni");
  await finishIdentity(root, "alumni");
  const registry = join(root, "platform/src/platform/registry.generated.ts");
  writeFileSync(registry, "// missing registry\n");
  await assert.rejects(checkApps(root), /registry is stale/);
  await syncApps(root);
  const rogue = join(root, "apps/separate-worker");
  mkdirSync(rogue, { recursive: true });
  await assert.rejects(checkApps(root), /one platform deployment/);
  rmSync(rogue, { recursive: true });
  mkdirSync(join(root, "platform/apps/unregistered"));
  await assert.rejects(checkApps(root), /missing app.json/);
});
test("CI rejects independent server actions and app deployment configuration", async (t) => {
  const root = await fixture(t);
  await createApp(root, "alumni");
  await finishIdentity(root, "alumni");
  const dir = join(root, "platform/apps/alumni");
  writeFileSync(join(dir, "action.ts"), 'export async function mutate() { "use server"; }');
  await assert.rejects(checkApps(root), /guarded platform API/);
  rmSync(join(dir, "action.ts"));
  writeFileSync(join(dir, "wrangler.jsonc"), "{}");
  await assert.rejects(checkApps(root), /deployment and dependencies/);
});
test("catalog rejects external URLs, duplicate IDs and permission collisions", async (t) => {
  const root = await fixture(t);
  await createApp(root, "alumni", "Alumni");
  const file = join(root, "platform/apps/alumni/app.json");
  const app = { id: "alumni", name: "Alumni", description: "", permissions: [] };
  for (const value of [
    { ...app, url: "https://external.test" },
    { ...app, id: "other" },
    { ...app, permissions: [{ id: "open", label: "Again" }] },
  ]) {
    writeFileSync(file, JSON.stringify(value));
    await assert.rejects(syncApps(root));
  }
});

test("CI rejects app routes shadowing the central permission guard", async (t) => {
  const root = await fixture(t);
  const directory = join(root, "platform/app/apps/alumni");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "page.tsx"), "export default () => 'private';");
  await assert.rejects(checkApps(root), /direct routes can bypass/);
});

test("apps inherit the MCP adapter instead of creating their own servers or transports", async (t) => {
  const root = await fixture(t);
  await createApp(root, "notes");
  await finishIdentity(root, "notes");
  const file = join(root, "platform/apps/notes/mcp.ts");
  for (const source of [
    'import {McpServer} from "@modelcontextprotocol/server";',
    'export {McpServer} from "@modelcontextprotocol/server";',
    'const sdk = await import("@modelcontextprotocol/server");',
  ]) {
    writeFileSync(file, source);
    await assert.rejects(checkApps(root), /MCP servers and transports belong to the platform/);
  }
  rmSync(file);
  const rogue = join(root, "platform/app/mcp/notes");
  mkdirSync(rogue, { recursive: true });
  writeFileSync(join(rogue, "route.ts"), "export const POST = () => new Response();");
  await assert.rejects(checkApps(root), /direct routes can bypass/);
});

test("app settings reject symlinks and oversized files before parsing", async (t) => {
  const root = await fixture(t);
  await createApp(root, "notes");
  const file = join(root, "platform/apps/notes/app.json");
  const target = join(root, "outside.json");
  writeFileSync(target, readFileSync(file));
  rmSync(file);
  symlinkSync(target, file);
  await assert.rejects(syncApps(root));
  rmSync(file);
  writeFileSync(file, " ".repeat(65537));
  await assert.rejects(syncApps(root), /size limit/);
});

test("layout migration tolerates old ignored caches without admitting old app source", async (t) => {
  const root = await fixture(t);
  const old = join(root, "apps/launcher");
  mkdirSync(join(old, "node_modules"), { recursive: true });
  writeFileSync(join(old, ".dev.vars"), "SYNTHETIC_SETTING=fixture\n");
  await checkApps(root);
  assert.equal(readFileSync(join(old, ".dev.vars"), "utf8"), "SYNTHETIC_SETTING=fixture\n");
  writeFileSync(join(old, "package.json"), "{}");
  await assert.rejects(checkApps(root), /one platform deployment/);
});

test("scaffolded apps get a starter icon and guide that review must replace", async (t) => {
  const root = await fixture(t);
  await createApp(root, "notes", "Client notes");
  const dir = join(root, "platform/apps/notes");
  assert.match(readFileSync(join(dir, "guide.md"), "utf8"), /# Client notes/);
  await assert.rejects(checkApps(root), /starter icon/);
  writeFileSync(join(dir, "icon.svg"), ownIcon);
  await syncApps(root);
  await assert.rejects(checkApps(root), /starter guide/);
  writeFileSync(join(dir, "guide.md"), "# Client notes\n\nRecord meeting notes.\n");
  await syncApps(root);
  await assert.rejects(checkApps(root), /## Icon/);
  await finishIdentity(root, "notes");
  await checkApps(root);
});

test("sync publishes versioned icons and bundles guides; check catches drift", async (t) => {
  const root = await fixture(t);
  await createApp(root, "notes");
  await finishIdentity(root, "notes");
  const catalog = JSON.parse(
    readFileSync(join(root, "platform/src/platform/catalog.generated.json"), "utf8"),
  );
  assert.match(catalog[0].icon, /^\/app-icons\/notes\.svg\?v=[0-9a-f]{12}$/);
  const published = join(root, "platform/public/app-icons/notes.svg");
  assert.equal(readFileSync(published, "utf8"), ownIcon);
  assert.match(
    JSON.parse(readFileSync(join(root, "platform/src/platform/guides.generated.json"), "utf8"))
      .notes,
    /client notes/,
  );
  writeFileSync(published, "<svg/>");
  await assert.rejects(checkApps(root), /icons are stale/);
  await syncApps(root);
  writeFileSync(join(root, "platform/public/app-icons/removed.svg"), ownIcon);
  await assert.rejects(checkApps(root), /icons are stale/);
  await syncApps(root);
  await checkApps(root);
  writeFileSync(join(root, "platform/apps/notes/guide.md"), "# notes\n\nChanged.\n");
  await assert.rejects(checkApps(root), /guides are stale/);
  const dir = join(root, "platform/apps/notes");
  writeFileSync(join(dir, "icon.png"), "x");
  await assert.rejects(syncApps(root), /exactly one/);
  rmSync(join(dir, "icon.png"));
  writeFileSync(join(dir, "icon.svg"), "<svg><script/></svg>");
  await assert.rejects(syncApps(root), /not allowed|square/);
  rmSync(join(dir, "guide.md"));
  writeFileSync(join(dir, "icon.svg"), ownIcon);
  await assert.rejects(syncApps(root), /missing guide.md/);
});
