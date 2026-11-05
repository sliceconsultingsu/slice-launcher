import { describe, expect, it } from "vitest";
import { ActivityStore } from "./activity";

function memoryKv() {
  const data = new Map<string, string>();
  let writes = 0;
  const kv = {
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async put(key: string, value: string) {
      writes += 1;
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
  return { kv: kv as unknown as KVNamespace, data, writes: () => writes };
}

function clock(start: string) {
  let now = new Date(start).getTime();
  return {
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("ActivityStore", () => {
  it("touch twice within 5 minutes writes once", async () => {
    const memory = memoryKv();
    const time = clock("2026-11-05T12:00:00Z");
    const store = new ActivityStore(memory.kv, time.now);
    await store.touch("user", "grant");
    time.advance(4 * 60_000);
    await store.touch("user", "grant");
    expect(memory.writes()).toBe(1);
    expect((await store.get("user", "grant")).lastUsedAt).toBe("2026-11-05T12:00:00.000Z");
  });

  it("touch after 5 minutes updates lastUsedAt", async () => {
    const memory = memoryKv();
    const time = clock("2026-11-05T12:00:00Z");
    const store = new ActivityStore(memory.kv, time.now);
    await store.touch("user", "grant");
    time.advance(5 * 60_000);
    await store.touch("user", "grant");
    expect((await store.get("user", "grant")).lastUsedAt).toBe("2026-11-05T12:05:00.000Z");
  });

  it("renewed records renewedAt and keeps lastUsedAt", async () => {
    const memory = memoryKv();
    const time = clock("2026-11-05T12:00:00Z");
    const store = new ActivityStore(memory.kv, time.now);
    await store.touch("user", "grant");
    time.advance(60_000);
    await store.renewed("user", "grant");
    expect(await store.get("user", "grant")).toEqual({
      lastUsedAt: "2026-11-05T12:00:00.000Z",
      renewedAt: "2026-11-05T12:01:00.000Z",
    });
  });

  it("remove clears the record", async () => {
    const memory = memoryKv();
    const store = new ActivityStore(memory.kv, clock("2026-11-05T12:00:00Z").now);
    await store.renewed("user", "grant");
    await store.remove("user", "grant");
    expect(await store.get("user", "grant")).toEqual({ lastUsedAt: null, renewedAt: null });
  });

  it("keeps records apart per user and grant under a Slice prefix", async () => {
    const memory = memoryKv();
    const store = new ActivityStore(memory.kv, clock("2026-11-05T12:00:00Z").now);
    await store.touch("user", "grant-a");
    expect([...memory.data.keys()]).toEqual(["slice-activity:user:grant-a"]);
    expect((await store.get("user", "grant-b")).lastUsedAt).toBeNull();
  });
});
