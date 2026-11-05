import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import console from "node:console";
import { pathToFileURL } from "node:url";

class RolloutPending extends Error {}

export async function checkLauncher(
  baseUrl,
  { signal, access, expectedRelease, timeoutMs = 30000, retryDelayMs = 500 } = {},
) {
  const base = new URL(baseUrl);
  const request = (path) => {
    const target = new URL(path, base);
    assert.equal(target.origin, base.origin, "Assets must use the same origin");
    return fetch(target, {
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]),
      headers: {
        "User-Agent": "slice-launcher-smoke/1.0",
        ...(access
          ? { "CF-Access-Client-Id": access.id, "CF-Access-Client-Secret": access.secret }
          : {}),
      },
    });
  };

  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const health = await request("/api/health");
      if ([404, 502, 503, 504].includes(health.status)) {
        await health.body?.cancel();
        throw new RolloutPending("Health route is propagating");
      }
      assert.equal(health.status, 200, "Health endpoint must return 200");
      const body = await health.json();
      assert.equal(body.status, "ok");
      if (expectedRelease && body.release !== expectedRelease) {
        throw new RolloutPending("Intended release is not serving yet");
      }
      break;
    } catch (error) {
      // Startup connection failures and an explicitly old/transient route are retryable.
      // Authentication, malformed JSON, and unexpected responses fail immediately.
      if (
        signal?.aborted ||
        Date.now() >= deadline ||
        !(
          error instanceof RolloutPending ||
          (error instanceof TypeError && error.cause?.code === "ECONNREFUSED")
        )
      )
        throw error;
      await delay(retryDelayMs, undefined, { signal });
    }
  }

  const page = await request("/");
  assert.equal(page.status, 200, "Launcher page must return 200");
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  const html = await page.text();
  assert.match(html, /App Launcher/);

  const assets = new Map();
  for (const tag of html.matchAll(/<(?:link|script)\b[^>]*>/gi)) {
    const url = tag[0].match(/(?:href|src)="([^"]+)"/i)?.[1];
    const normalizedTag = tag[0].toLowerCase();
    if (!url || !url.startsWith("/") || url.startsWith("//")) continue;
    if (normalizedTag.startsWith("<link") && /rel="stylesheet"/i.test(tag[0]))
      assets.set(url, "text/css");
    if (normalizedTag.startsWith("<script") && /\bsrc=/i.test(tag[0]))
      assets.set(url, "javascript");
  }
  assert.ok([...assets.values()].includes("text/css"), "Page must reference a stylesheet");
  assert.ok([...assets.values()].includes("javascript"), "Page must reference its JavaScript");
  for (const [url, type] of assets) {
    const response = await request(url);
    assert.equal(response.status, 200, `Asset failed: ${url}`);
    assert.ok(
      (response.headers.get("content-type") ?? "").includes(type),
      `Wrong asset type: ${url}`,
    );
    assert.ok((await response.text()).length > 0, `Empty asset: ${url}`);
  }
  console.log(
    `Launcher page, health endpoint, and ${assets.size} assets passed at ${base.origin}.`,
  );
}

async function checkServiceDenied(
  baseUrl,
  path,
  { access, retryDelayMs = 1000, timeoutMs = 30000 },
) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const response = await fetch(new URL(path, baseUrl), {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        "CF-Access-Client-Id": access.id,
        "CF-Access-Client-Secret": access.secret,
        ...(path === "/mcp"
          ? { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }
          : {}),
      },
      ...(path === "/mcp"
        ? {
            method: "POST",
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
          }
        : {}),
    });
    // The previous Worker version has no membership route during initial propagation.
    // Retry only that 404; successful data access or any other auth result fails immediately.
    if (response.status === 404 && Date.now() < deadline) {
      await response.body?.cancel();
      await delay(retryDelayMs);
      continue;
    }
    assert.equal(response.status, 401, "Service identity must not access membership data");
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    // Slice's own AI sign-in adds an OAuth challenge; when present it must point back here.
    if (response.headers.get("www-authenticate")) {
      const target = challengeMetadata(response, baseUrl);
      assert.ok(
        target.pathname.startsWith("/.well-known/oauth-protected-resource"),
        "Unexpected OAuth metadata path",
      );
    }
    await response.body?.cancel();
    console.log("Protected API rejects the CI service identity: " + path);
    return;
  }
}

export function checkMembershipDenied(baseUrl, options) {
  return checkServiceDenied(baseUrl, "/api/membership", options);
}
export function checkMcpDenied(baseUrl, options) {
  return checkServiceDenied(baseUrl, "/mcp", options);
}

/** The challenge's metadata address, which must stay on the launcher's own origin. */
function challengeMetadata(response, baseUrl) {
  const challenge = response.headers.get("www-authenticate") || "";
  assert.match(challenge, /^Bearer\s/i);
  const metadata = /resource_metadata="([^"]+)"/i.exec(challenge)?.[1];
  assert.ok(metadata, "OAuth challenge must advertise resource metadata");
  const target = new URL(metadata);
  assert.equal(
    target.origin,
    new URL(baseUrl).origin,
    "OAuth metadata must stay on the protected origin",
  );
  return target;
}

async function readMetadata(target) {
  const info = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(5000) });
  assert.equal(info.status, 200, "OAuth metadata must be available");
  const reader = info.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      assert.ok(bytes <= 16384, "OAuth metadata exceeds bound");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function checkAccessBoundary(baseUrl, accessDomain) {
  const domain = new URL(accessDomain);
  assert.equal(domain.protocol, "https:");
  assert.ok(domain.hostname.endsWith(".cloudflareaccess.com"));
  for (const path of ["/", "/api/membership", "/mcp"]) {
    const response = await fetch(new URL(path, baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    if (response.status === 401) {
      // AI sign-in answers with an OAuth challenge instead of a browser redirect. Two kinds are
      // valid: Cloudflare Access managed OAuth (older releases, on every path) and Slice's own
      // OAuth (current releases, /mcp only, while pages keep redirecting to Access).
      const target = challengeMetadata(response, baseUrl);
      const data = await readMetadata(target);
      if (target.pathname.startsWith("/.well-known/cloudflare-access-protected-resource/")) {
        assert.deepEqual(
          data.authorization_servers,
          [domain.origin],
          "Unexpected OAuth authorization server",
        );
        assert.equal(
          new URL(data.resource).origin,
          new URL(baseUrl).origin,
          "Unexpected OAuth resource",
        );
        continue;
      }
      assert.equal(path, "/mcp", "Only /mcp may answer with Slice's OAuth challenge");
      assert.ok(
        target.pathname.startsWith("/.well-known/oauth-protected-resource"),
        "Unexpected OAuth metadata path",
      );
      const origin = new URL(baseUrl).origin;
      assert.deepEqual(
        data.authorization_servers,
        [origin],
        "Unexpected OAuth authorization server",
      );
      assert.equal(data.resource, `${origin}/mcp`, "Unexpected OAuth resource");
      continue;
    }
    assert.ok(
      [302, 303, 307].includes(response.status),
      "Unauthenticated request must be redirected to Access",
    );
    const target = new URL(response.headers.get("location"));
    assert.equal(target.origin, domain.origin, "Unexpected Access login origin");
    assert.ok(target.pathname.startsWith("/cdn-cgi/access/login"), "Expected Access login");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  assert.ok(process.argv[2], "Usage: node scripts/check-launcher.mjs <base-url>");
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  assert.equal(Boolean(id), Boolean(secret), "Both Access service credentials are required");
  if (id && secret) {
    assert.ok(process.env.ACCESS_TEAM_DOMAIN, "Expected Access team domain is required");
    await checkAccessBoundary(process.argv[2], process.env.ACCESS_TEAM_DOMAIN);
    await checkMembershipDenied(process.argv[2], { access: { id, secret } });
  }
  await checkLauncher(process.argv[2], {
    access: id && secret ? { id, secret } : undefined,
    expectedRelease: process.env.EXPECTED_RELEASE_SHA,
  });
  if (id && secret) {
    await checkMembershipDenied(process.argv[2], { access: { id, secret } });
    // Forward releases must expose MCP behind the same human-only identity check.
    // Older verified rollback targets predate this route and retain their original checks.
    if (process.env.SLICE_MCP_REQUIRED === "true")
      await checkMcpDenied(process.argv[2], { access: { id, secret } });
  }
}
