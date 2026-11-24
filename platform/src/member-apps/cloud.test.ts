import { describe, expect, it } from "vitest";
import { cloudflareApps } from "./cloud";

type Call = { url: string; method: string; headers: Headers; body: unknown };
/** A stand-in for Cloudflare's API that records each call and answers from a script. */
function recorded(answers: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fake: typeof fetch = async (input, init) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body,
    };
    calls.push(call);
    const answer = answers(call);
    return Response.json(answer.body, { status: answer.status ?? 200 });
  };
  return { calls, fake };
}
const config = (fake: typeof fetch) => ({
  accountId: "acct123",
  token: "secret-token-value",
  namespace: "slice-apps",
  fetch: fake,
});
const base = "https://api.cloudflare.com/client/v4/accounts/acct123";
const ok = (result: unknown) => ({ body: { success: true, result } });

describe("an app's own database", () => {
  it("is created under the app's name and identified by Cloudflare's ID", async () => {
    const { calls, fake } = recorded(() => ok({ uuid: "db-uuid-1", name: "slice-app-notes" }));
    expect(await cloudflareApps(config(fake)).ensureDatabase("notes")).toBe("db-uuid-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: `${base}/d1/database`, method: "POST" });
    expect(calls[0].headers.get("Authorization")).toBe("Bearer secret-token-value");
    expect(JSON.parse(String(calls[0].body))).toEqual({ name: "slice-app-notes" });
  });

  it("is found again, not made twice, when it already exists", async () => {
    const { calls, fake } = recorded((call) =>
      call.method === "POST"
        ? { status: 400, body: { success: false, errors: [{ message: "already exists" }] } }
        : ok([
            { uuid: "other", name: "slice-app-notes-old" },
            { uuid: "db-uuid-1", name: "slice-app-notes" },
          ]),
    );
    expect(await cloudflareApps(config(fake)).ensureDatabase("notes")).toBe("db-uuid-1");
    expect(calls[1]).toMatchObject({
      url: `${base}/d1/database?name=slice-app-notes`,
      method: "GET",
    });
  });

  it("fails without saying why in Cloudflare's words, or showing the token", async () => {
    const { fake } = recorded((call) =>
      call.method === "POST"
        ? { status: 403, body: { success: false, errors: [{ message: "bad secret-token-value" }] } }
        : ok([]),
    );
    const failure = await cloudflareApps(config(fake))
      .ensureDatabase("notes")
      .catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("The app's database could not be created.");
    expect(String(failure)).not.toContain("secret-token-value");
  });
});

describe("an app's server code", () => {
  const code = "export default { fetch() { return new Response('hi') } }";

  it("is uploaded as its own Worker with one thing attached: the app's database", async () => {
    const { calls, fake } = recorded(() => ok({}));
    await cloudflareApps(config(fake)).uploadServer(
      "notes-0123456789abcdef",
      code,
      "db-uuid-1",
      "notes",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: `${base}/workers/dispatch/namespaces/slice-apps/scripts/notes-0123456789abcdef`,
      method: "PUT",
    });
    expect(calls[0].headers.get("Authorization")).toBe("Bearer secret-token-value");
    const form = calls[0].body as FormData;
    expect([...form.keys()].sort()).toEqual(["metadata", "worker.js"]);
    const metadata = JSON.parse(await (form.get("metadata") as File).text());
    expect(metadata).toEqual({
      main_module: "worker.js",
      compatibility_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      bindings: [{ type: "d1", name: "DB", id: "db-uuid-1" }],
      tags: ["slice-app:notes"],
    });
    const module = form.get("worker.js") as File;
    expect(module.type).toBe("application/javascript+module");
    expect(await module.text()).toBe(code);
  });

  it.each(["../x", "a/b", "A", "", "x".repeat(64), "a b"])(
    "refuses to upload under the name %j",
    async (script) => {
      const { calls, fake } = recorded(() => ok({}));
      await expect(
        cloudflareApps(config(fake)).uploadServer(script, code, "db-uuid-1", "notes"),
      ).rejects.toThrow();
      expect(calls).toEqual([]);
    },
  );

  it("fails with a plain message when Cloudflare refuses the upload", async () => {
    const { fake } = recorded(() => ({
      status: 400,
      body: { success: false, errors: [{ message: "Uncaught SyntaxError at secret-token-value" }] },
    }));
    const failure = await cloudflareApps(config(fake))
      .uploadServer("notes-0123456789abcdef", code, "db-uuid-1", "notes")
      .catch((error: Error) => error);
    expect((failure as Error).message).toBe(
      "The app's server code could not be uploaded. Check worker.js for errors.",
    );
  });

  it("treats a network failure like any other failure", async () => {
    const broken: typeof fetch = async () => {
      throw new TypeError("fetch failed: secret-token-value");
    };
    const failure = await cloudflareApps(config(broken))
      .ensureDatabase("notes")
      .catch((error: Error) => error);
    expect((failure as Error).message).toBe("The app's database could not be created.");
  });
});
