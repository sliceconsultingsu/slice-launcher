import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { checkLauncher, checkMembershipDenied } from "./check-launcher.mjs";

async function serve(
  t,
  missingAsset = false,
  observe = () => {},
  externalAsset = false,
  uppercase = false,
) {
  const server = createServer((request, response) => {
    observe(request);
    const routes = new Map(
      Object.entries({
        "/api/health": ["application/json", '{"status":"ok"}'],
        "/": [
          "text/html",
          '<h1>App Launcher</h1><link rel="stylesheet" href="/app.css"><script src="/app.js"></script>',
        ],
        "/app.css": ["text/css", "body { color: black; }"],
        "/app.js": ["text/javascript", "void 0;"],
      }),
    );
    const route = routes.get(request.url);
    if (!route || (missingAsset && request.url === "/app.js")) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.setHeader("content-type", route[0]);
    if (uppercase && request.url === "/")
      route[1] = route[1].replace(
        /<(\/?)(link|script)/g,
        (_match, slash, tag) => "<" + slash + tag.toUpperCase(),
      );
    response.end(
      externalAsset && request.url === "/"
        ? route[1].replace("/app.js", "/\\evil.invalid/app.js")
        : route[1],
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("checks the served launcher and its stylesheet and JavaScript", async (t) => {
  await checkLauncher(await serve(t));
});

test("fails a release when health works but a page asset is missing", async (t) => {
  await assert.rejects(checkLauncher(await serve(t, true)), /Asset failed/);
});

test("sends the service credential to the page, health and assets", async (t) => {
  const seen = [];
  const url = await serve(t, false, (request) => seen.push(request.headers));
  await checkLauncher(url, { access: { id: "fixture-id", secret: "fixture-secret" } });
  assert.equal(seen.length, 4);
  for (const headers of seen) {
    assert.equal(headers["cf-access-client-id"], "fixture-id");
    assert.equal(headers["cf-access-client-secret"], "fixture-secret");
  }
});

test("never sends credentials to an asset on another origin", async (t) => {
  await assert.rejects(
    checkLauncher(await serve(t, false, () => {}, true), {
      access: { id: "fixture-id", secret: "fixture-secret" },
    }),
    /same origin/,
  );
});

test("waits for the new membership route during rollout", async (t) => {
  let calls = 0;
  const server = createServer((_request, response) => {
    calls++;
    response.writeHead(calls === 1 ? 404 : 401, {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    });
    response.end('{"error":"Sign in required"}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await checkMembershipDenied(`http://127.0.0.1:${server.address().port}`, {
    access: { id: "fixture", secret: "fixture" },
    retryDelayMs: 1,
  });
  assert.equal(calls, 2);
});

test("never retries a successful service-identity data response", async (t) => {
  let calls = 0;
  const server = createServer((_request, response) => {
    calls++;
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(
    checkMembershipDenied(`http://127.0.0.1:${server.address().port}`, {
      access: { id: "fixture", secret: "fixture" },
      retryDelayMs: 1,
    }),
    /Service identity/,
  );
  assert.equal(calls, 1);
});

test("fails if the membership route remains missing after the deadline", async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(
    checkMembershipDenied(`http://127.0.0.1:${server.address().port}`, {
      access: { id: "fixture", secret: "fixture" },
      retryDelayMs: 1,
      timeoutMs: 5,
    }),
    /Service identity/,
  );
});

async function probeServer(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("unauthenticated requests must reach the configured Access login", async (t) => {
  const { checkAccessBoundary } = await import("./check-launcher.mjs");
  const requests = [];
  const url = await probeServer(t, (request, response) => {
    requests.push(request);
    response.writeHead(302, {
      location: "https://fixture.cloudflareaccess.com/cdn-cgi/access/login/example",
    });
    response.end();
  });
  await checkAccessBoundary(url, "https://fixture.cloudflareaccess.com");
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => !request.headers["cf-access-client-secret"]));
  await assert.rejects(checkAccessBoundary(url, "https://wrong.cloudflareaccess.com"), /origin/);
});

test("missing Access protection fails immediately", async (t) => {
  const { checkAccessBoundary } = await import("./check-launcher.mjs");
  let calls = 0;
  const url = await probeServer(t, (_request, response) => {
    calls++;
    response.writeHead(200);
    response.end("public");
  });
  await assert.rejects(
    checkAccessBoundary(url, "https://fixture.cloudflareaccess.com"),
    /redirected/,
  );
  assert.equal(calls, 1);
});

test("a stale release never passes production verification", async (t) => {
  let calls = 0;
  const url = await probeServer(t, (_request, response) => {
    calls++;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", release: "old" }));
  });
  await assert.rejects(
    checkLauncher(url, { expectedRelease: "new", timeoutMs: 0, retryDelayMs: 1 }),
    /not serving yet/,
  );
  // An expired deadline must fail on the first stale response, independent of runner speed.
  assert.equal(calls, 1);
});

test("an auth failure during rollout is not retried", async (t) => {
  let calls = 0;
  const url = await probeServer(t, (_request, response) => {
    calls++;
    response.writeHead(403);
    response.end();
  });
  await assert.rejects(checkLauncher(url, { retryDelayMs: 1 }), /Health endpoint/);
  assert.equal(calls, 1);
});

test("smoke checks inspect uppercase HTML asset tags", async (t) => {
  await checkLauncher(await serve(t, false, () => {}, false, true));
  await assert.rejects(checkLauncher(await serve(t, true, () => {}, false, true)), /Asset failed/);
});

test("managed OAuth challenges require same-origin bounded metadata and the pinned Access issuer", async (t) => {
  const { checkAccessBoundary } = await import("./check-launcher.mjs");
  let mode = "valid";
  const url = await probeServer(t, (request, response) => {
    if (request.url.startsWith("/.well-known/")) {
      response.setHeader("Content-Type", "application/json");
      response.end(
        mode === "oversized"
          ? "x".repeat(17000)
          : JSON.stringify({
              resource: url,
              authorization_servers: [
                mode === "wrong-issuer"
                  ? "https://wrong.cloudflareaccess.com"
                  : "https://fixture.cloudflareaccess.com",
              ],
            }),
      );
      return;
    }
    response.writeHead(401, {
      "WWW-Authenticate":
        mode === "plain"
          ? "Basic"
          : `Bearer resource_metadata="${mode === "external" ? "https://evil.invalid" : url}/.well-known/cloudflare-access-protected-resource/mcp"`,
    });
    response.end();
  });
  await checkAccessBoundary(url, "https://fixture.cloudflareaccess.com");
  for (const value of ["wrong-issuer", "external", "plain", "oversized"]) {
    mode = value;
    await assert.rejects(checkAccessBoundary(url, "https://fixture.cloudflareaccess.com"));
  }
});

test("MCP release checks require the route to reject CI service credentials", async (t) => {
  const { checkMcpDenied } = await import("./check-launcher.mjs");
  let status = 401;
  const url = await probeServer(t, (request, response) => {
    assert.equal(request.url, "/mcp");
    assert.equal(request.method, "POST");
    assert.equal(request.headers["cf-access-client-id"], "synthetic");
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    });
    response.end(JSON.stringify({ error: "Sign in required" }));
  });
  const options = { access: { id: "synthetic", secret: "synthetic" }, timeoutMs: 0 };
  await checkMcpDenied(url, options);
  for (const code of [200, 404, 302]) {
    status = code;
    await assert.rejects(checkMcpDenied(url, options));
  }
});
