// Development-only entry: never imported by an app, Worker, or production route.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { database, migrate, reset } from "../database";
import { Repository } from "../../src/membership/repository";
import { enroll } from "../../src/membership/domain";
import { verifyIdentity } from "../../src/membership/auth";
import { createPlatform } from "../../src/platform/dispatch";
import type { AppModule } from "../../src/platform/contracts";
import { apps } from "../../src/lib/apps";
import { workspacePort } from "../../workspace-ports";

const defaultPort = workspacePort(0, 4310);
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--port"))
  throw new Error("Usage: team:dev [--port 4311]");
const port = args.length ? Number(args[1]) : defaultPort;
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Use a port between 1024 and 65535.");
const testPassword = process.env.SLICE_TEAM_TEST_PASSWORD;
if (testPassword !== undefined && !/^[a-f0-9]{64}$/.test(testPassword))
  throw new Error("The browser test password must be 32 random bytes encoded as hex.");
const password = testPassword ?? randomBytes(32).toString("hex");
const authorization = Buffer.from(`Basic ${Buffer.from(`learner:${password}`).toString("base64")}`);
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = await database();
await migrate(fixture.db);
await reset(fixture.db);
const repository = new Repository(fixture.db);
const config = {
  issuer: "https://slice-learning-only.cloudflareaccess.com",
  audience: "slice-learning-only",
};
const email = "owner@example.test";
const initial = await repository.load();
const joined = enroll(
  initial,
  { subject: `${config.issuer}|learner`, email },
  { id: "learning-owner", now: new Date().toISOString() },
);
if (!joined.audit) throw new Error("Unable to seed learning identity.");
await repository.commit(initial, { ...joined, audit: joined.audit });
const pair = await generateKeyPair("RS256");
const keys = createLocalJWKSet({
  keys: [{ ...(await exportJWK(pair.publicKey)), kid: "learning-only" }],
});
const server = createServer();
const vite = await createViteServer({
  configFile: false,
  envDir: false,
  root,
  cacheDir: "node_modules/.vite-team",
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  plugins: [react()],
  appType: "custom",
  server: {
    middlewareMode: true,
    host: "127.0.0.1",
    allowedHosts: ["localhost"],
    // No unauthenticated WebSocket path; contributors reload after editing.
    hmr: false,
    ws: false,
    fs: {
      strict: true,
      allow: [
        root,
        fileURLToPath(new URL("../../../packages", import.meta.url)),
        fileURLToPath(new URL("../../../node_modules", import.meta.url)),
      ],
      deny: [
        "**/.git/**",
        "**/.env*",
        "**/.dev.vars*",
        "**/.e2e/**",
        "**/*.{pem,key,crt}",
        "**/.slice-workspace.json",
      ],
    },
  },
});
server.on("request", async (req, res) => {
  try {
    const host = req.headers.host;
    const origin = `http://${host}`;
    if (
      !host ||
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) ||
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      res.writeHead(403);
      res.end("This synthetic preview accepts same-origin loopback requests only.");
      return;
    }
    if (!req.url?.startsWith("/") || req.url.startsWith("//")) {
      res.writeHead(400);
      res.end();
      return;
    }
    const provided = Buffer.from(req.headers.authorization ?? "");
    if (provided.length !== authorization.length || !timingSafeEqual(provided, authorization)) {
      res.writeHead(401, {
        "WWW-Authenticate": `Basic realm="Slice learning preview ${port}", charset="UTF-8"`,
        "Cache-Control": "no-store",
      });
      res.end("Use learner and the temporary password printed in your own preview terminal.");
      return;
    }
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith("/api/apps/alumni/")) {
      let path: string[];
      try {
        path = url.pathname.slice("/api/apps/alumni/".length).split("/").map(decodeURIComponent);
      } catch {
        res.writeHead(400);
        res.end("Invalid API path encoding.");
        return;
      }
      // No production credentials: an ephemeral, server-only key signs the fictional learner.
      const jwt = await new SignJWT({ sub: "learner", email, type: "app" })
        .setProtectedHeader({ alg: "RS256", kid: "learning-only" })
        .setIssuer(config.issuer)
        .setAudience(config.audience)
        .setIssuedAt()
        .setExpirationTime("1m")
        .sign(pair.privateKey);
      const headers = new Headers({ "Cf-Access-Jwt-Assertion": jwt });
      if (req.headers.origin) headers.set("origin", req.headers.origin);
      if (req.headers["content-type"]) headers.set("content-type", req.headers["content-type"]);
      let body: string | undefined;
      if (!["GET", "HEAD"].includes(req.method ?? "GET")) {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16384) {
            res.writeHead(413);
            res.end();
            return;
          }
          chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString("utf8");
      }
      const module = (await vite.ssrLoadModule("/apps/alumni/server.tsx")) as {
        default: AppModule;
      };
      const platform = createPlatform({
        catalog: apps,
        modules: new Map([["alumni", module.default]]),
        verify: (request) => verifyIdentity(request, config, keys),
        loadState: () => repository.load(),
      });
      const response = await platform.api(
        new Request(url, { method: req.method, headers, body }),
        "alumni",
        path,
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } else if (url.pathname === "/" || url.pathname === "/apps/alumni") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      const html = await vite.transformIndexHtml(
        url.pathname,
        '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slice alumni learning preview</title></head><body><div id="root"></div><script type="module" src="/tests/team/main.tsx"></script></body></html>',
      );
      res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : html);
    } else
      vite.middlewares(req, res, () => {
        res.writeHead(404);
        res.end();
      });
  } catch (error) {
    console.error(
      "Learning preview request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    if (!res.headersSent) res.writeHead(500);
    res.end("Learning preview error. Check the development terminal.");
  }
});
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  server.close();
  server.closeAllConnections();
  await vite.close();
  await fixture.runtime.dispose();
  process.exit(code);
}
server.on("error", (error) => {
  console.error(
    `Preview could not start: ${error.message}. Choose another port or stop your existing preview.`,
  );
  void close(1);
});
server.listen(port, "127.0.0.1", () => {
  if (!testPassword) console.log(`Preview username: learner\nTemporary password: ${password}`);
  console.log(
    `Slice learning preview: http://127.0.0.1:${port}\nFictional data only. Remote users must forward this port over their own approved SSH connection. Stop with Ctrl+C; restart resets this workspace's disposable database.`,
  );
});
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
