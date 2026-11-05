import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { fileURLToPath } from "node:url";

const origin = "https://slice.example";
const fixtureEmail = "ai@example.test";
const fixtureSubject = "https://test.cloudflareaccess.com|ai-test";

async function bundle() {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL("../../tests/ai-connections/worker.ts", import.meta.url)),
        formats: ["es"],
        fileName: "worker",
      },
      rollupOptions: { external: ["cloudflare:workers"] },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw new Error("Expected one Worker bundle");
  const chunk = output.output.find((item) => item.type === "chunk" && item.isEntry);
  if (!chunk || chunk.type !== "chunk") throw new Error("Missing Worker entry");
  return chunk.code;
}

function runtimeFor(script: string) {
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      kvNamespaces: ["OAUTH_KV"],
      ratelimits: { OAUTH_LIMITER: { namespace_id: "1001", simple: { limit: 20, period: 60 } } },
    }),
  );
}

let script: string;
let runtime: Miniflare;
const call = async (path: string, init?: RequestInit) => {
  const response = await runtime.dispatchFetch(`${origin}${path}`, {
    redirect: "manual",
    ...init,
  } as never);
  return response as unknown as Response;
};

function base64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}
async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

async function register(redirectUri = "https://client.example/cb", name = "Claude") {
  return call("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      client_name: name,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
}

async function connect(clientId?: string) {
  const id = clientId ?? ((await (await register()).json()) as { client_id: string }).client_id;
  const { verifier, challenge } = await pkce();
  const query = new URLSearchParams({
    response_type: "code",
    client_id: id,
    redirect_uri: "https://client.example/cb",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "state-1",
    scope: "slice",
    resource: `${origin}/mcp`,
  });
  const approval = await call(`/authorize?${query}`);
  expect(approval.status).toBe(302);
  const code = new URL(approval.headers.get("location") ?? "").searchParams.get("code") ?? "";
  const token = await call("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://client.example/cb",
      client_id: id,
      code_verifier: verifier,
      resource: `${origin}/mcp`,
    }),
  });
  expect(token.status).toBe(200);
  const tokens = (await token.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return { clientId: id, code, ...tokens };
}

function listTools(accessToken?: string, extra: Record<string, string> = {}) {
  return call("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...extra,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
}

const activity = async () =>
  (await (await call("/__test/activity")).json()) as {
    id: string;
    lastUsedAt: string | null;
    renewedAt: string | null;
  }[];

beforeAll(async () => {
  script = await bundle();
  runtime = runtimeFor(script);
}, 60000);
afterAll(async () => {
  await runtime?.dispose();
});
afterEach(async () => {
  await call("/__test/revoke", { method: "POST" });
  await call("/__test/reset", { method: "POST" });
});

describe("Slice OAuth for AI apps", () => {
  it("anonymous /mcp returns a Bearer challenge pointing at Slice metadata", async () => {
    const response = await listTools();
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(
      `resource_metadata="${origin}/.well-known/oauth-protected-resource`,
    );
    const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1] ?? "";
    const metadata = (await (await call(new URL(metadataUrl).pathname)).json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(metadata.resource).toBe(`${origin}/mcp`);
    expect(metadata.authorization_servers).toEqual([origin]);
  });

  it("anonymous /mcp explains itself as JSON, like other protected APIs", async () => {
    const response = await listTools();
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toMatchObject({ error: "invalid_token" });
  });

  it("registers, authorizes with PKCE and lists tools", async () => {
    const { access_token } = await connect();
    const client = new Client({ name: "oauth-test", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
          fetch: async (input, init) => {
            const request = new Request(input, init);
            request.headers.set("Authorization", `Bearer ${access_token}`);
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
    } finally {
      await client.close();
    }
  }, 30000);

  it("access pass expires after 7 days", async () => {
    expect((await connect()).expires_in).toBe(604800);
  });

  it("refresh renews and records renewal", async () => {
    const { clientId, refresh_token } = await connect();
    const renewed = await call("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token,
        client_id: clientId,
      }),
    });
    expect(renewed.status).toBe(200);
    const fresh = (await renewed.json()) as { access_token: string };
    expect((await listTools(fresh.access_token)).status).toBe(200);
    const [record] = await activity();
    expect(record.renewedAt).not.toBeNull();
  });

  it("use records lastUsedAt and does not rewrite it within 5 minutes", async () => {
    const { access_token } = await connect();
    expect((await listTools(access_token)).status).toBe(200);
    const first = (await activity())[0].lastUsedAt;
    expect(first).not.toBeNull();
    expect((await listTools(access_token)).status).toBe(200);
    expect((await activity())[0].lastUsedAt).toBe(first);
  });

  it("suspended member gets 403 on the next request", async () => {
    const { access_token } = await connect();
    expect((await listTools(access_token)).status).toBe(200);
    await call("/__test/member", { method: "POST", body: JSON.stringify({ status: "suspended" }) });
    expect((await listTools(access_token)).status).toBe(403);
  });

  it("identity rebinding is refused", async () => {
    const { access_token } = await connect();
    await call("/__test/member", {
      method: "POST",
      body: JSON.stringify({ email: "someone-else@example.test" }),
    });
    expect((await listTools(access_token)).status).toBe(403);
    await call("/__test/reset", { method: "POST" });
    await call("/__test/member", {
      method: "POST",
      body: JSON.stringify({ subject: "https://test.cloudflareaccess.com|other" }),
    });
    expect((await listTools(access_token)).status).toBe(403);
  });

  it("Cf-Access-Jwt-Assertion alone is refused", async () => {
    const response = await listTools(undefined, {
      "Cf-Access-Jwt-Assertion": "header.payload.sig",
    });
    expect(response.status).toBe(401);
  });

  it("pass does not contain email or subject", async () => {
    const { code, access_token, refresh_token } = await connect();
    for (const value of [code, access_token, refresh_token]) {
      expect(value).not.toContain(fixtureEmail);
      expect(value).not.toContain(fixtureSubject);
      expect(value).not.toContain("ai-test");
    }
  });

  it("reconnecting the same client replaces its grant", async () => {
    const first = await connect();
    const second = await connect(first.clientId);
    expect(await activity()).toHaveLength(1);
    expect((await listTools(first.access_token)).status).toBe(401);
    expect((await listTools(second.access_token)).status).toBe(200);
  });

  it("disconnect stops the pass and its renewal", async () => {
    const { clientId, access_token, refresh_token } = await connect();
    expect((await listTools(access_token)).status).toBe(200);
    await call("/__test/revoke", { method: "POST" });
    expect((await listTools(access_token)).status).toBe(401);
    const renewal = await call("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token,
        client_id: clientId,
      }),
    });
    expect(renewal.status).toBe(400);
    expect(await renewal.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("register refuses a plain http redirect outside this computer", async () => {
    expect((await register("http://evil.example/cb")).status).toBe(400);
    expect((await register("http://127.0.0.1:5555/cb")).status).toBe(201);
    expect((await register("http://localhost:5555/cb")).status).toBe(201);
    expect((await register("https://claude.ai/cb")).status).toBe(201);
  });

  it("OAuth responses are private", async () => {
    for (const response of [
      await listTools(),
      await call("/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code: "bogus" }),
      }),
    ]) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
});

describe("Slice OAuth rate limits", () => {
  // Limits count per clock minute, so a run that crosses a minute boundary starts a new count.
  // The first 20 must pass, and a refusal must come within the next window's 20 (41 in all).
  it("registrations beyond 20 a minute from one address are refused", async () => {
    const limited = runtimeFor(script);
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 41 && !statuses.includes(429); i++) {
        const response = (await limited.dispatchFetch(`${origin}/oauth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
          body: JSON.stringify({
            redirect_uris: ["https://client.example/cb"],
            token_endpoint_auth_method: "none",
          }),
        })) as unknown as Response;
        statuses.push(response.status);
        await response.body?.cancel();
      }
      expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
      expect(statuses).toContain(429);
    } finally {
      await limited.dispose();
    }
  }, 30000);
});
