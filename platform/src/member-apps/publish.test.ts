import { describe, expect, it } from "vitest";
import { readBundle } from "./publish";

const page = "<!doctype html><title>Notes</title><h1>Notes</h1>";
const bundle = (overrides: Record<string, unknown> = {}) => ({
  name: "Team notes",
  description: "Notes the team shares.",
  guide: "# Team notes\n\nWrite a note, and everyone on the app sees it.",
  files: [{ path: "index.html", text: page }],
  ...overrides,
});
function refusal(input: unknown, options?: { server?: boolean; large?: boolean }): string {
  try {
    readBundle(input, options);
  } catch (error) {
    expect((error as { status?: number }).status).toBe(400);
    return (error as Error).message;
  }
  throw new Error("Expected the bundle to be refused");
}
const text = (body: Uint8Array) => new TextDecoder().decode(body);

describe("reading what a builder's AI publishes", () => {
  it("accepts screens, styles, scripts and images, and works out each file's type", () => {
    const png = "iVBORw0KGgo=";
    const read = readBundle(
      bundle({
        powers: [{ id: "edit", label: "Edit notes" }],
        files: [
          { path: "index.html", text: page },
          { path: "css/site.css", text: "body{margin:0}" },
          { path: "js/app.js", text: "console.log(1)" },
          { path: "img/logo.png", base64: png },
          { path: "data/start.json", text: "{}" },
        ],
      }),
    );
    expect(read).toMatchObject({
      name: "Team notes",
      description: "Notes the team shares.",
      powers: [{ id: "edit", label: "Edit notes" }],
    });
    expect(read.files.map((file) => [file.path, file.type])).toEqual([
      ["index.html", "text/html; charset=utf-8"],
      ["css/site.css", "text/css; charset=utf-8"],
      ["js/app.js", "text/javascript; charset=utf-8"],
      ["img/logo.png", "image/png"],
      ["data/start.json", "application/json; charset=utf-8"],
    ]);
    expect(text(read.files[0].body)).toBe(page);
    expect([...read.files[3].body.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("takes worker.js as the app's server code when server code is switched on", () => {
    const code = "export default { fetch() { return new Response('hi') } }";
    const read = readBundle(
      bundle({
        files: [
          { path: "index.html", text: page },
          { path: "worker.js", text: code },
        ],
      }),
      { server: true },
    );
    expect(read.server).toBe(code);
    // It is not one of the app's screens, so it is never among the files served.
    expect(read.files.map((file) => file.path)).toEqual(["index.html"]);
    expect(readBundle(bundle(), { server: true }).server).toBeNull();
    expect(readBundle(bundle()).server).toBeNull();
  });

  it("counts server code toward the size limits and still keeps api/ for it", () => {
    const big = "x".repeat(512 * 1024 + 1);
    expect(
      refusal(
        bundle({
          files: [
            { path: "index.html", text: page },
            { path: "worker.js", text: big },
          ],
        }),
        { server: true },
      ),
    ).toMatch(/512 KB/);
    expect(
      refusal(
        bundle({
          files: [
            { path: "index.html", text: page },
            { path: "api/x.json", text: "{}" },
          ],
        }),
        { server: true },
      ),
    ).toMatch(/api\//);
    expect(
      refusal(
        bundle({
          files: [
            { path: "index.html", text: page },
            { path: "Worker.js", text: "x" },
          ],
        }),
        { server: true },
      ),
    ).toMatch(/worker\.js/);
  });

  it("reads the tools an app offers, which need server code to answer them", () => {
    const tools = [{ name: "find_entry", description: "Find an entry.", readOnly: true }];
    const withCode = bundle({
      files: [
        { path: "index.html", text: page },
        { path: "worker.js", text: "export default {}" },
      ],
      tools,
    });
    expect(readBundle(withCode, { server: true }).tools).toEqual([
      {
        name: "find_entry",
        description: "Find an entry.",
        readOnly: true,
        power: null,
        input: { type: "object", properties: {}, additionalProperties: false },
      },
    ]);
    expect(readBundle(bundle()).tools).toEqual([]);
    expect(readBundle(bundle({ tools: [] })).tools).toEqual([]);
    // Screens only, with server code on: nothing would answer the tool.
    expect(refusal(bundle({ tools }), { server: true })).toContain("Add worker.js");
    // Server code off: said plainly, like worker.js itself.
    expect(refusal(bundle({ tools }))).toContain("not switched on yet");
    // A tool can need only a power this version declares.
    expect(
      refusal({ ...withCode, tools: [{ ...tools[0], power: "edit" }] }, { server: true }),
    ).toContain("not one of this app's powers");
    expect(refusal({ ...withCode, tools: "find_entry" }, { server: true })).toContain("tools");
  });

  it("treats powers as optional", () => {
    expect(readBundle(bundle()).powers).toEqual([]);
  });

  it.each([
    ["no files", { files: [] }, /at least one file/],
    ["no index.html", { files: [{ path: "home.html", text: page }] }, /index\.html/],
    [
      "an index.html in other capitals",
      { files: [{ path: "Index.html", text: page }] },
      /index\.html/,
    ],
    [
      "an index.html only in a folder",
      { files: [{ path: "site/index.html", text: page }] },
      /index\.html/,
    ],
    ["a path that climbs out", { files: [{ path: "../index.html", text: page }] }, /path/],
    ["a path from the root", { files: [{ path: "/index.html", text: page }] }, /path/],
    [
      "a hidden file",
      {
        files: [
          { path: "index.html", text: page },
          { path: ".env", text: "x" },
        ],
      },
      /path/,
    ],
    [
      "a hidden folder",
      {
        files: [
          { path: "index.html", text: page },
          { path: "a/.git/x.txt", text: "x" },
        ],
      },
      /path/,
    ],
    [
      "a backslash",
      {
        files: [
          { path: "index.html", text: page },
          { path: "a\\b.js", text: "x" },
        ],
      },
      /path/,
    ],
    [
      "a space",
      {
        files: [
          { path: "index.html", text: page },
          { path: "my file.js", text: "x" },
        ],
      },
      /path/,
    ],
    [
      "an encoded dot",
      {
        files: [
          { path: "index.html", text: page },
          { path: "%2e%2e/x.js", text: "x" },
        ],
      },
      /path/,
    ],
    [
      "a doubled slash",
      {
        files: [
          { path: "index.html", text: page },
          { path: "a//b.js", text: "x" },
        ],
      },
      /path/,
    ],
    [
      "a trailing slash",
      {
        files: [
          { path: "index.html", text: page },
          { path: "a/", text: "x" },
        ],
      },
      /path/,
    ],
    [
      "a file type that is not allowed",
      {
        files: [
          { path: "index.html", text: page },
          { path: "run.php", text: "x" },
        ],
      },
      /type/,
    ],
    [
      "no file type",
      {
        files: [
          { path: "index.html", text: page },
          { path: "LICENSE", text: "x" },
        ],
      },
      /type/,
    ],
    [
      "a file under api/",
      {
        files: [
          { path: "index.html", text: page },
          { path: "api/data.json", text: "{}" },
        ],
      },
      /api\//,
    ],
    [
      "server code",
      {
        files: [
          { path: "index.html", text: page },
          { path: "worker.js", text: "x" },
        ],
      },
      /Server code/,
    ],
    [
      "the same file twice",
      {
        files: [
          { path: "index.html", text: page },
          { path: "Index.html", text: page },
        ],
      },
      /twice/,
    ],
    [
      "both text and base64",
      { files: [{ path: "index.html", text: page, base64: "eA==" }] },
      /text or base64/,
    ],
    ["neither text nor base64", { files: [{ path: "index.html" }] }, /text or base64/],
    [
      "base64 that is not base64",
      {
        files: [
          { path: "index.html", text: page },
          { path: "a.png", base64: "not base64!" },
        ],
      },
      /base64/,
    ],
    [
      "an image sent as text",
      {
        files: [
          { path: "index.html", text: page },
          { path: "a.png", text: "x" },
        ],
      },
      /base64/,
    ],
    ["no guide", { guide: " " }, /guide/],
    ["a guide that is too long", { guide: "x".repeat(20001) }, /guide/],
    ["no name", { name: "" }, /name/],
    ["no description", { description: "" }, /description/],
    ["an unknown field", { secret: "x" }, /secret/],
    ["something that is not an object", null, /./],
  ])("refuses %s", (_why, overrides, message) => {
    const input = overrides === null ? "publish" : bundle(overrides as Record<string, unknown>);
    expect(refusal(input)).toMatch(message);
  });

  it("refuses more than 50 files", () => {
    const files = Array.from({ length: 51 }, (_, n) => ({ path: `p${n}.html`, text: page }));
    files[0].path = "index.html";
    expect(refusal(bundle({ files }))).toMatch(/50 files/);
  });

  it("refuses a file over 512 KB and a bundle over 1 MB", () => {
    const big = "x".repeat(512 * 1024 + 1);
    expect(
      refusal(
        bundle({
          files: [
            { path: "index.html", text: page },
            { path: "big.js", text: big },
          ],
        }),
      ),
    ).toMatch(/512 KB/);
    const part = "x".repeat(400 * 1024);
    expect(
      refusal(
        bundle({
          files: [
            { path: "index.html", text: page },
            { path: "a.js", text: part },
            { path: "b.js", text: part },
            { path: "c.js", text: part },
          ],
        }),
      ),
    ).toMatch(/1 MB/);
  });

  it("allows more through an upload address: 100 files, 2 MB each, 5 MB in all", () => {
    const files = Array.from({ length: 100 }, (_, n) => ({ path: `p${n}.html`, text: page }));
    files[0].path = "index.html";
    expect(readBundle(bundle({ files }), { large: true }).files).toHaveLength(100);
    expect(
      refusal(bundle({ files: [...files, { path: "one-more.html", text: page }] }), {
        large: true,
      }),
    ).toMatch(/100 files/);
    const two = "x".repeat(2 * 1024 * 1024);
    expect(
      readBundle(
        bundle({
          files: [
            { path: "index.html", text: page },
            { path: "big.js", text: two },
          ],
        }),
        {
          large: true,
        },
      ).files,
    ).toHaveLength(2);
    expect(
      refusal(
        bundle({
          files: [
            { path: "index.html", text: page },
            { path: "big.js", text: `${two}x` },
          ],
        }),
        {
          large: true,
        },
      ),
    ).toMatch(/2 MB/);
    expect(
      refusal(
        bundle({
          files: [
            { path: "index.html", text: page },
            { path: "a.js", text: two },
            { path: "b.js", text: two },
            { path: "c.js", text: two },
          ],
        }),
        { large: true },
      ),
    ).toMatch(/5 MB/);
  });

  it("counts a file's size in bytes, not characters", () => {
    const wide = "é".repeat(300 * 1024);
    expect(
      refusal(
        bundle({
          files: [
            { path: "index.html", text: page },
            { path: "a.js", text: wide },
          ],
        }),
      ),
    ).toMatch(/512 KB/);
  });
});
