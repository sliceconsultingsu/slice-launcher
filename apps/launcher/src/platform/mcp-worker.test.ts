import { it, expect } from "vitest";
import { build } from "vite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { fileURLToPath } from "node:url";

it("runs signed MCP discovery and calls in workerd without dynamic code generation", async () => {
  const bundle = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL("../../tests/mcp/worker.ts", import.meta.url)),
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
    }),
  );
  const client = new Client({ name: "worker-test", version: "1.0.0" });
  try {
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
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["slice_apps"]);
    expect(
      (await client.callTool({ name: "slice_apps", arguments: {} })).structuredContent,
    ).toEqual({ apps: [] });
  } finally {
    await client.close();
    await runtime.dispose();
  }
}, 30000);
