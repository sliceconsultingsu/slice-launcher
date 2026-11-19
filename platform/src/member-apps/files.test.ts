import { afterAll, beforeAll, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { kvFiles } from "./files";

let runtime: Miniflare;
let kv: KVNamespace;
beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
      compatibilityDate: "2026-10-02",
      kvNamespaces: ["APP_FILES"],
    }),
  );
  kv = (await runtime.getKVNamespace("APP_FILES")) as unknown as KVNamespace;
}, 30_000);
afterAll(async () => {
  await runtime?.dispose();
});
const bytes = (value: string) => new TextEncoder().encode(value);
const text = (body: ArrayBuffer) => new TextDecoder().decode(body);

it("keeps each publish's files apart, with their types", async () => {
  const files = kvFiles(kv);
  await files.put("notes", "first", [
    { path: "index.html", type: "text/html; charset=utf-8", body: bytes("one") },
    { path: "img/dot.png", type: "image/png", body: new Uint8Array([0x89, 0x50, 0x00, 0xff]) },
  ]);
  await files.put("notes", "second", [
    { path: "index.html", type: "text/html; charset=utf-8", body: bytes("two") },
  ]);
  const first = await files.get("notes", "first", "index.html");
  expect(first && text(first.body)).toBe("one");
  expect(first?.type).toBe("text/html; charset=utf-8");
  const second = await files.get("notes", "second", "index.html");
  expect(second && text(second.body)).toBe("two");
  const image = await files.get("notes", "first", "img/dot.png");
  expect(image && [...new Uint8Array(image.body)]).toEqual([0x89, 0x50, 0x00, 0xff]);
  expect(image?.type).toBe("image/png");
});

it("finds nothing for another app, another publish or another path", async () => {
  const files = kvFiles(kv);
  await files.put("ledger", "first", [{ path: "index.html", type: "text/html", body: bytes("x") }]);
  expect(await files.get("ledger", "second", "index.html")).toBeNull();
  expect(await files.get("ledge", "first", "index.html")).toBeNull();
  expect(await files.get("ledger", "first", "other.html")).toBeNull();
});
