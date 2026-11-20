// Evaluation-only reliability and scaling probes from the 2026-10-16 readiness review.
// Not part of CI. Run from platform/:
//   pnpm exec vitest run --config tests/evaluation/vitest.config.ts reliability-scaling
// Local Miniflare D1 timings show how work grows with membership size; they are not
// production latency measurements.
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { database, migrate, reset } from "../database";
import { verifyIdentity } from "../../src/membership/auth";
import { errorResponse, membershipRequest } from "../../src/membership/api";
import { Repository } from "../../src/membership/repository";
import type { Member } from "../../src/membership/contracts";

let fixture: Awaited<ReturnType<typeof database>>;
let repo: Repository;
beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
  repo = new Repository(fixture.db);
}, 60_000);
afterAll(async () => fixture?.runtime.dispose());

it("reports an identity-key outage as 'sign in again', not as a temporary service problem", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
  try {
    const request = new Request("https://slice.example/api/membership", {
      headers: { "cf-access-jwt-assertion": "eyJhbGciOiJSUzI1NiIsImtpZCI6Im9mZmxpbmUifQ.e30.c2ln" },
    });
    let response: Response;
    try {
      await verifyIdentity(request, {
        issuer: "https://jwks-outage.cloudflareaccess.com",
        audience: "slice-eval",
      });
      throw new Error("verification unexpectedly succeeded");
    } catch (error) {
      response = errorResponse(error);
    }
    expect(fetchSpy).toHaveBeenCalled();
    // Observed: 401 with a sign-in prompt. A user would retry sign-in in a loop during an outage.
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Your sign-in could not be verified. Sign in again.",
    });
  } finally {
    fetchSpy.mockRestore();
  }
});

function synthetic(index: number): Member {
  return {
    id: `m-${index}`,
    subject: `https://eval.cloudflareaccess.com|sub-${index}`,
    email: `person-${index}@example.test`,
    name: `Synthetic person ${index}`,
    title: "Consultant",
    status: index !== 0 && index % 10 === 0 ? "pending" : "active",
    levelId: "member",
    allow: [],
    deny: [],
    owner: index === 0,
    joinedAt: "2026-10-16T00:00:00.000Z",
  };
}
async function seed(count: number) {
  await reset(fixture.db);
  const statements = Array.from({ length: count }, (_, index) => {
    const member = synthetic(index);
    return fixture.db
      .prepare("INSERT INTO members(id, email, subject, document) VALUES (?, ?, ?, ?)")
      .bind(member.id, member.email, member.subject, JSON.stringify(member));
  });
  for (let i = 0; i < statements.length; i += 200)
    await fixture.db.batch(statements.slice(i, i + 200));
}
async function timeView(subjectIndex: number, samples: number) {
  const identity = {
    subject: `https://eval.cloudflareaccess.com|sub-${subjectIndex}`,
    email: `person-${subjectIndex}@example.test`,
  };
  const durations: number[] = [];
  let bytes = 0;
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    const response = await membershipRequest(
      new Request("https://slice.example/api/membership"),
      identity,
      repo,
    );
    bytes = (await response.text()).length;
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const pick = (q: number) => Math.round(durations[Math.floor(q * (samples - 1))] * 10) / 10;
  return { p50: pick(0.5), p95: pick(0.95), bytes };
}

it("loads the whole organization on every request; cost grows with membership size", async () => {
  const rows: Record<string, unknown>[] = [];
  for (const count of [25, 250, 1000]) {
    await seed(count);
    const owner = await timeView(0, 30); // owner sees full records
    const member = await timeView(1, 30); // ordinary member sees the limited directory
    rows.push({ members: count, ownerMs: owner, memberMs: member });
  }
  console.log(JSON.stringify(rows));
  // Response size for an administrator grows linearly: no pagination exists.
  const owner25 = rows[0].ownerMs as { bytes: number };
  const owner1000 = rows[2].ownerMs as { bytes: number };
  expect(owner1000.bytes).toBeGreaterThan(owner25.bytes * 20);
}, 120_000);
