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

test("sends no credentials to the page, health and assets", async (t) => {
  const seen = [];
  const url = await serve(t, false, (request) => seen.push(request.headers));
  await checkLauncher(url);
  assert.equal(seen.length, 4);
  for (const headers of seen) {
    assert.equal(headers["cf-access-client-id"], undefined);
    assert.equal(headers["cf-access-client-secret"], undefined);
    assert.equal(headers.authorization, undefined);
  }
});

test("never fetches an asset on another origin", async (t) => {
  await assert.rejects(checkLauncher(await serve(t, false, () => {}, true)), /same origin/);
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
    retryDelayMs: 1,
  });
  assert.equal(calls, 2);
});

test("never retries a successful anonymous data response", async (t) => {
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
      retryDelayMs: 1,
    }),
    /Anonymous requests/,
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
      retryDelayMs: 1,
      timeoutMs: 5,
    }),
    /Anonymous requests/,
  );
});

async function probeServer(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

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

test("MCP release checks require the route to refuse anonymous requests", async (t) => {
  const { checkMcpDenied } = await import("./check-launcher.mjs");
  let status = 401;
  const url = await probeServer(t, (request, response) => {
    assert.equal(request.url, "/mcp");
    assert.equal(request.method, "POST");
    assert.equal(request.headers["cf-access-client-id"], undefined);
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    });
    response.end(JSON.stringify({ error: "Sign in required" }));
  });
  const options = { timeoutMs: 0 };
  await checkMcpDenied(url, options);
  for (const code of [200, 404, 302]) {
    status = code;
    await assert.rejects(checkMcpDenied(url, options));
  }
});

test("MCP release checks accept the Slice challenge and reject one pointing elsewhere", async (t) => {
  const { checkMcpDenied } = await import("./check-launcher.mjs");
  let metadata = "";
  const url = await probeServer(t, (_request, response) => {
    response.writeHead(401, {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "WWW-Authenticate": `Bearer resource_metadata="${metadata}"`,
    });
    response.end(JSON.stringify({ error: "invalid_token" }));
  });
  const options = { timeoutMs: 0 };
  metadata = `${url}/.well-known/oauth-protected-resource/mcp`;
  await checkMcpDenied(url, options);
  metadata = "https://evil.invalid/.well-known/oauth-protected-resource/mcp";
  await assert.rejects(checkMcpDenied(url, options), /origin/);
});

/** A launcher that answers for itself: public shell, 401 API, Slice's OAuth challenge on /mcp. */
async function inAppServer(t, mode = () => "valid") {
  const url = await probeServer(t, (request, response) => {
    const m = mode();
    if (request.url === "/.well-known/oauth-protected-resource/mcp") {
      if (m === "oversized") {
        response.setHeader("Content-Type", "application/json");
        response.end("x".repeat(17000));
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          resource: m === "foreign-resource" ? "https://evil.invalid/mcp" : `${url}/mcp`,
          authorization_servers: [m === "foreign-server" ? "https://evil.invalid" : url],
        }),
      );
      return;
    }
    if (request.url === "/mcp") {
      response.writeHead(401, {
        "WWW-Authenticate":
          m === "plain"
            ? "Basic"
            : `Bearer resource_metadata="${m === "external" ? "https://evil.invalid" : url}/.well-known/oauth-protected-resource/mcp"`,
      });
      response.end();
      return;
    }
    if (request.url === "/api/membership") {
      response.writeHead(m === "public-api" ? 200 : 401, {
        "Content-Type": "application/json",
        "Cache-Control": m === "cacheable-api" ? "public, max-age=60" : "private, no-store",
      });
      response.end(JSON.stringify({ error: "Sign in to Slice." }));
      return;
    }
    if (m === "access") {
      response.writeHead(302, {
        location: "https://fixture.cloudflareaccess.com/cdn-cgi/access/login/example",
      });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<h1>App Launcher</h1>");
  });
  return url;
}

test("the sign-in boundary accepts Slice's own sign-in", async (t) => {
  const { checkSignInBoundary } = await import("./check-launcher.mjs");
  await checkSignInBoundary(await inAppServer(t));
});

test("the sign-in boundary refuses public data, foreign OAuth metadata and redirects", async (t) => {
  const { checkSignInBoundary } = await import("./check-launcher.mjs");
  let mode = "valid";
  const url = await inAppServer(t, () => mode);
  for (const value of [
    "public-api",
    "cacheable-api",
    "foreign-resource",
    "foreign-server",
    "external",
    "plain",
    "oversized",
    "access",
  ]) {
    mode = value;
    await assert.rejects(checkSignInBoundary(url), undefined, value);
  }
});
