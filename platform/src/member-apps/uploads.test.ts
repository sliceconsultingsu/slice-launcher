import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { startUpload, takeUpload } from "./uploads";

let fixture: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
}, 30_000);
beforeEach(async () => {
  await reset(fixture.db);
});
afterAll(async () => {
  await fixture?.runtime.dispose();
});
const ana = { subject: "ana-sub", email: "ana@example.test" };

describe("a one-time upload address", () => {
  it("stands for the member and app it was made for, once", async () => {
    const token = await startUpload(fixture.db, ana, "notes", true);
    expect(token).toHaveLength(43);
    expect(await takeUpload(fixture.db, token)).toEqual({
      appId: "notes",
      identity: ana,
      preview: true,
    });
    expect(await takeUpload(fixture.db, token)).toBeNull();
  });

  it("carries whether to publish as a preview", async () => {
    const token = await startUpload(fixture.db, ana, "notes", false);
    expect((await takeUpload(fixture.db, token))!.preview).toBe(false);
  });

  it("lasts ten minutes", async () => {
    const token = await startUpload(fixture.db, ana, "notes", false);
    const row = await fixture.db
      .prepare("SELECT expires_at FROM app_uploads")
      .first<{ expires_at: string }>();
    const left = Date.parse(row!.expires_at) - Date.now();
    expect(left).toBeGreaterThan(590_000);
    expect(left).toBeLessThanOrEqual(600_000);
    await fixture.db
      .prepare("UPDATE app_uploads SET expires_at = '2020-01-01T00:00:00.000Z'")
      .run();
    expect(await takeUpload(fixture.db, token)).toBeNull();
  });

  it.each(["", "short", "x".repeat(43), "x".repeat(400)])(
    "is nothing for the made-up token %j",
    async (token) => {
      await startUpload(fixture.db, ana, "notes", false);
      expect(await takeUpload(fixture.db, token)).toBeNull();
    },
  );

  it("stores only a hash, and clears out expired addresses", async () => {
    const old = await startUpload(fixture.db, ana, "notes", false);
    await fixture.db
      .prepare("UPDATE app_uploads SET expires_at = '2020-01-01T00:00:00.000Z'")
      .run();
    const token = await startUpload(fixture.db, ana, "notes", false);
    const rows = await fixture.db.prepare("SELECT hash FROM app_uploads").all<{ hash: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows.results)).not.toContain(token);
    expect(await takeUpload(fixture.db, old)).toBeNull();
  });
});
