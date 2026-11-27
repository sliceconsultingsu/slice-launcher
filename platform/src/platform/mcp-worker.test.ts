import { it, expect } from "vitest";
import { build } from "vite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { fileURLToPath } from "node:url";
import { migrate } from "../../tests/database";

/** Builds one fixture Worker, runs it in workerd, and hands a signed-in MCP client to `use`. */
async function inWorkerd(
  entry: string,
  options: { database?: boolean },
  use: (client: Client, runtime: Miniflare) => Promise<void>,
) {
  const bundle = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL(`../../tests/mcp/${entry}`, import.meta.url)),
        formats: ["es"],
        fileName: "worker",
      },
    },
  });
  const output = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!("output" in output)) throw new Error("Expected one Worker bundle");
  const chunk = output.output.find((item) => item.type === "chunk" && item.isEntry);
  if (!chunk || chunk.type !== "chunk") throw new Error("Missing Worker entry");
  const pair = await generateKeyPair("RS256");
  const jwt = await new SignJWT({ email: "worker@example.test", type: "app" })
    .setProtectedHeader({ alg: "RS256", kid: "worker-test" })
    .setIssuer("https://test.cloudflareaccess.com")
    .setAudience("worker-test")
    .setSubject("worker-test")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pair.privateKey);
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: chunk.code,
      compatibilityDate: "2026-10-01",
      bindings: {
        PUBLIC_JWK: JSON.stringify({ ...(await exportJWK(pair.publicKey)), kid: "worker-test" }),
      },
      ...(options.database ? { d1Databases: ["DB"] } : {}),
    }),
  );
  const client = new Client({ name: "worker-test", version: "1.0.0" });
  try {
    if (options.database) {
      const db = await runtime.getD1Database("DB");
      await migrate(db);
      await db
        .prepare("UPDATE organization SET owner_email = 'worker@example.test' WHERE id = 'slice'")
        .run();
    }
    expect((await runtime.dispatchFetch("https://slice.example/mcp")).status).toBe(401);
    await client.connect(
      new StreamableHTTPClientTransport(new URL("https://slice.example/mcp"), {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          request.headers.set("Cf-Access-Jwt-Assertion", jwt);
          const response = await runtime.dispatchFetch(request.url, {
            method: request.method,
            headers: [...request.headers],
            body: request.body ? await request.text() : undefined,
          });
          return new Response(response.status === 204 ? null : await response.text(), {
            status: response.status,
            headers: [...response.headers],
          });
        },
      }),
    );
    await use(client, runtime);
  } finally {
    await client.close();
    await runtime.dispose();
  }
}

it("runs signed MCP discovery and calls in workerd without dynamic code generation", async () => {
  await inWorkerd("worker.ts", {}, async (client) => {
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["slice_apps"]);
    expect(
      (await client.callTool({ name: "slice_apps", arguments: {} })).structuredContent,
    ).toEqual({ apps: [] });
  });
}, 30000);

it("publishes a member app's tools, offers them and checks their input in workerd", async () => {
  await inWorkerd("member-apps-worker.ts", { database: true }, async (client) => {
    const made = await client.callTool({
      name: "slice_app_create",
      arguments: { id: "notes", name: "Team notes", description: "Notes the team shares." },
    });
    expect(made.isError).toBeFalsy();
    const input = {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 20 },
        filter: {
          type: ["object", "null"],
          properties: { tags: { type: "array", items: { type: "string", enum: ["a", "b"] } } },
        },
      },
      required: ["query"],
    };
    const published = await client.callTool({
      name: "slice_app_publish",
      arguments: {
        id: "notes",
        name: "Team notes",
        description: "Notes the team shares.",
        guide: "# Team notes",
        files: [
          { path: "index.html", text: "<!doctype html><title>Notes</title>" },
          { path: "worker.js", text: "export default {}" },
        ],
        tools: [
          { name: "find_entry", description: "Find entries by title.", readOnly: true, input },
        ],
      },
    });
    expect(published.structuredContent).toMatchObject({ version: 1, server: true, tools: 1 });
    const offered = (await client.listTools()).tools.find(
      (tool) => tool.name === "notes__find_entry",
    );
    expect(offered?.inputSchema).toMatchObject({
      type: "object",
      required: ["query"],
      additionalProperties: false,
    });
    const good = { query: "plan", filter: { tags: ["a"] } };
    expect(
      (await client.callTool({ name: "notes__find_entry", arguments: good })).structuredContent,
    ).toEqual({ path: "/__slice/tools/find_entry", input: good, member: "worker-test" });
    // Refused by the launcher from the app's own description, before the app's code is asked.
    for (const bad of [
      {},
      { query: "" },
      { query: "plan", other: 1 },
      { query: "plan", filter: { tags: ["c"] } },
      { query: "plan", filter: { tags: ["a"], more: true } },
    ]) {
      const refused = await client
        .callTool({ name: "notes__find_entry", arguments: bad })
        .then((result) => result.isError === true)
        .catch(() => true);
      expect(refused).toBe(true);
    }
  });
}, 60000);
