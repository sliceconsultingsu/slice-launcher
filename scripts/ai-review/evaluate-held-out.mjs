import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { configFromEnv, review, modelContext, PROMPT, OUTPUT_SCHEMA, LIMITS } from "./core.mjs";
import { scoreRun } from "./evaluate.mjs";

// Frozen after the line-numbering change; labels are only consumed by the scorer.
export async function evaluateHeldOut({ env = {}, fetcher = fetch } = {}) {
  if (env.AI_EVAL_LIVE !== "true") throw new Error("Live evaluation requires explicit opt-in");
  const cfg = configFromEnv({ ...env, AI_JEV_ENABLED: "false" });
  if (!cfg.gptKey) throw new Error("Dedicated GPT inference credential required");
  const root = new URL("./fixtures/held-out/", import.meta.url);
  const contexts = JSON.parse(await readFile(new URL("contexts.json", root), "utf8"));
  const labels = JSON.parse(await readFile(new URL("expected.json", root), "utf8"));
  if (!contexts.length || contexts.length > 5) throw new Error("Held-out fixture bound exceeded");
  const reservedUpperUsd = contexts.reduce(
    (sum, { context }) =>
      sum +
      ((Buffer.byteLength(
        JSON.stringify(modelContext(context)) + PROMPT + JSON.stringify(OUTPUT_SCHEMA),
      ) +
        4096) *
        cfg.reserveInputRate +
        LIMITS.outputTokens * cfg.reserveOutputRate) /
        1e6,
    0,
  );
  const maxUsd = Number(env.AI_EVAL_MAX_USD || 1);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 1 || reservedUpperUsd > maxUsd)
    throw new Error("Held-out evaluation exceeds hard $1 reservation");
  const runs = [];
  for (const { id, context } of contexts) {
    const result = await review(context, cfg, fetcher);
    runs.push({
      id,
      contextSha256: createHash("sha256").update(JSON.stringify(context)).digest("hex"),
      result,
      score: scoreRun(
        result,
        labels.find((label) => label.id === id),
      ),
    });
  }
  return {
    mode: "live-held-out",
    createdAt: new Date().toISOString(),
    model: cfg.gptModel,
    provider: cfg.gptProvider,
    reservedUpperUsd,
    maxUsd,
    interpretation:
      "Small synthetic source cases held out from the line-format implementation. Candidate matches require semantic review; not hosted PR or general accuracy evidence.",
    runs,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await evaluateHeldOut({ env: process.env });
  await mkdir("ai-review-output", { recursive: true });
  await writeFile("ai-review-output/held-out-live.json", JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify({
      statuses: result.runs.map(({ id, result }) => ({
        id,
        status: result.status,
        reason: result.reason,
        findings: result.findings.length,
      })),
      reservedUpperUsd: result.reservedUpperUsd,
    }),
  );
}
