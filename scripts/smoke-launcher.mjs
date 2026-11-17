import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { checkImageEndpointClosed, checkLauncher, checkMcpDenied } from "./check-launcher.mjs";
import { checkSignedIn, signedInFixture } from "./signed-in-smoke.mjs";

const platformDirectory = fileURLToPath(new URL("../platform/", import.meta.url));
const wranglerConfig = ["--config", "dist/server/wrangler.json"];

// A disposable local database for this run: every migration, then synthetic people and sessions.
// It never touches a developer's local state or any remote database.
const state = await mkdtemp(join(tmpdir(), "slice-smoke-"));
const fixture = signedInFixture();
async function wrangler(...args) {
  await promisify(execFile)("./node_modules/.bin/wrangler", [...args, ...wranglerConfig], {
    cwd: platformDirectory,
    env: { ...process.env, CI: "1" },
  });
}
try {
  const local = ["MEMBERSHIP_DB", "--local", "--persist-to", state];
  await wrangler("d1", "migrations", "apply", ...local);
  const seed = join(state, "seed.sql");
  await writeFile(seed, fixture.sql);
  await wrangler("d1", "execute", ...local, "--file", seed);
} catch (error) {
  await rm(state, { recursive: true, force: true });
  throw error;
}

// Use a free loopback port so the probe does not reuse a developer server.
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);

const worker = spawn(
  "./node_modules/.bin/wrangler",
  [
    "dev",
    ...wranglerConfig,
    "--local",
    "--persist-to",
    state,
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--inspector-port",
    "0",
  ],
  {
    cwd: platformDirectory,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
worker.stdout.on("data", (data) => {
  logs = (logs + data).slice(-16000);
});
worker.stderr.on("data", (data) => {
  logs = (logs + data).slice(-16000);
});
const controller = new AbortController();
worker.once("error", (error) => controller.abort(error));
worker.once("exit", (code) => controller.abort(new Error(`Wrangler exited (${code})`)));

const interrupted = () => controller.abort(new Error("Smoke check interrupted"));
process.once("SIGINT", interrupted);
process.once("SIGTERM", interrupted);

function signalWorkerGroup(signal) {
  if (!worker.pid) return false;
  try {
    process.kill(-worker.pid, signal);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

try {
  await checkLauncher(`http://127.0.0.1:${port}`, {
    signal: controller.signal,
    expectedRelease: process.env.SLICE_RELEASE_SHA,
    requireSecurityHeaders: true,
  });
  await checkImageEndpointClosed(`http://127.0.0.1:${port}`, { signal: controller.signal });
  // A compiled route probe: missing routes and forged/service headers must not pass.
  await checkMcpDenied(`http://127.0.0.1:${port}`, {
    access: { id: "synthetic-service", secret: "synthetic-secret" },
    timeoutMs: 0,
  });
  await checkSignedIn(`http://127.0.0.1:${port}`, fixture);
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  signalWorkerGroup("SIGTERM");
  const deadline = Date.now() + 3000;
  while (signalWorkerGroup(0) && Date.now() < deadline) await delay(50);
  if (signalWorkerGroup(0)) signalWorkerGroup("SIGKILL");
  process.removeListener("SIGINT", interrupted);
  process.removeListener("SIGTERM", interrupted);
  await rm(state, { recursive: true, force: true });
}
