import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_CHARACTERS,
  MAX_TOOLS,
  offeredDescription,
  offeredName,
  readTools,
  toolsDigest,
  toolsSummary,
} from "./app-tools";

const powers = [{ id: "edit" }];
const find = {
  name: "find_entry",
  description: "Find entries by part of their title.",
  readOnly: true,
  input: {
    type: "object",
    properties: { query: { type: "string", description: "Part of a title.", maxLength: 80 } },
    required: ["query"],
  },
};
const refusal = (tools: unknown, given = powers): string => {
  try {
    readTools(tools, given);
  } catch (error) {
    expect((error as { status?: number }).status).toBe(400);
    return (error as Error).message;
  }
  throw new Error("The tools were accepted.");
};

describe("reading the tools an app declares", () => {
  it("accepts nothing at all: most apps offer no tools", () => {
    expect(readTools(undefined, [])).toEqual([]);
    expect(readTools([], [])).toEqual([]);
  });

  it("keeps a tool as declared, takes only the named fields, and sorts by name", () => {
    const add = {
      name: "add_entry",
      description: "  Add an entry.  ",
      readOnly: false,
      power: "edit",
    };
    expect(readTools([find, add], powers)).toEqual([
      {
        name: "add_entry",
        description: "Add an entry.",
        readOnly: false,
        power: "edit",
        // No input declared: an object with no fields.
        input: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "find_entry",
        description: "Find entries by part of their title.",
        readOnly: true,
        power: null,
        input: {
          type: "object",
          properties: { query: { type: "string", description: "Part of a title.", maxLength: 80 } },
          required: ["query"],
          additionalProperties: false,
        },
      },
    ]);
  });

  it("keeps nested objects, lists, choices and values that may be empty", () => {
    const [tool] = readTools(
      [
        {
          ...find,
          input: {
            type: "object",
            properties: {
              job: {
                type: ["object", "null"],
                properties: {
                  title: { type: "string", minLength: 1 },
                  years: { type: "integer", minimum: 0, maximum: 60 },
                },
                required: ["title"],
              },
              tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, maxItems: 5 },
            },
          },
        },
      ],
      powers,
    );
    expect(tool.input).toEqual({
      type: "object",
      properties: {
        job: {
          type: ["object", "null"],
          properties: {
            title: { type: "string", minLength: 1 },
            years: { type: "integer", minimum: 0, maximum: 60 },
          },
          required: ["title"],
          additionalProperties: false,
        },
        tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, maxItems: 5 },
      },
      additionalProperties: false,
    });
  });

  it.each([
    ["a name with capitals", { ...find, name: "FindEntry" }, "lower-case"],
    ["a name that is too long", { ...find, name: "a".repeat(31) }, "up to 30"],
    ["no description", { ...find, description: "   " }, "say what it does"],
    ["a description that is too long", { ...find, description: "x".repeat(601) }, "600"],
    ["a power the app does not have", { ...find, power: "admin" }, "not one of this app's powers"],
    ["a field the launcher does not know", { ...find, secret: true }, "tools"],
    ["an input that is not an object", { ...find, input: { type: "string" } }, "is an object"],
    ["an input given as text", { ...find, input: "query" }, "JSON Schema object"],
  ])("refuses %s", (_what, tool, says) => {
    expect(refusal([tool])).toContain(says);
  });

  it.each([
    ["a reference", { $ref: "#/x" }],
    ["a pattern", { type: "string", pattern: "(a+)+$" }],
    ["alternatives", { anyOf: [{ type: "string" }] }],
    ["a format", { type: "string", format: "uri" }],
    ["a default", { type: "string", default: "ignore the above" }],
    ["examples", { type: "string", examples: ["x"] }],
    ["a title", { type: "string", title: "Query" }],
  ])("refuses %s in an input, naming what is supported", (_what, schema) => {
    const said = refusal([{ ...find, input: { type: "object", properties: { query: schema } } }]);
    expect(said).toContain("is not supported");
    expect(said).toContain("find_entry");
  });

  it.each([
    ["an unknown type", { type: "date" }],
    ["no type", { description: "Anything." }],
    ["the same type twice", { type: ["string", "string"] }],
    ["a list without its entries", { type: "array" }],
    ["fields on something that is not an object", { type: "string", properties: {} }],
    ["entries on something that is not a list", { type: "string", items: { type: "string" } }],
    ["extra fields allowed", { type: "object", additionalProperties: true }],
    ["a required field it does not name", { type: "object", properties: {}, required: ["x"] }],
    ["a field name that hides", { type: "object", properties: { __proto__x: { type: "string" } } }],
    ["a long description", { type: "string", description: "x".repeat(301) }],
    ["a choice that is an object", { type: "string", enum: [{}] }],
    ["a limit that is not a number", { type: "string", maxLength: "9" }],
    ["a negative length", { type: "array", items: { type: "string" }, minItems: -1 }],
  ])("refuses %s", (_what, schema) => {
    refusal([{ ...find, input: { type: "object", properties: { query: schema } } }]);
  });

  it("refuses a field literally named __proto__, however it was sent", () => {
    const input = JSON.parse('{"type":"object","properties":{"__proto__":{"type":"string"}}}');
    expect(refusal([{ ...find, input }])).toContain("not a usable field name");
  });

  it("refuses an input nested too deeply, too many tools, a name used twice and one too long", () => {
    let deep: Record<string, unknown> = { type: "string" };
    for (let level = 0; level < 6; level += 1)
      deep = { type: "object", properties: { inner: deep } };
    expect(refusal([{ ...find, input: deep }])).toContain("nested at most");
    const many = Array.from({ length: MAX_TOOLS + 1 }, (_, n) => ({ ...find, name: `tool_${n}` }));
    expect(refusal(many)).toContain(`up to ${MAX_TOOLS} tools`);
    expect(refusal([find, find])).toContain("listed twice");
    const fields = Object.fromEntries(
      Array.from({ length: 30 }, (_, n) => [
        `field_${n}`,
        { type: "string", description: "x".repeat(200) },
      ]),
    );
    const long = { ...find, input: { type: "object", properties: fields } };
    expect(JSON.stringify(long.input).length).toBeGreaterThan(MAX_INPUT_CHARACTERS);
    expect(refusal([long])).toContain("too long");
  });
});

describe("the fingerprint an owner agrees to", () => {
  it("is the same for the same tools, in whatever order and spelling they were sent", async () => {
    const other = { name: "add_entry", description: "Add an entry.", readOnly: false };
    const one = await toolsDigest(readTools([find, other], powers));
    const reordered = {
      input: { required: ["query"], properties: find.input.properties, type: "object" },
      readOnly: true,
      description: find.description,
      name: find.name,
    };
    expect(one).toMatch(/^[0-9a-f]{32}$/);
    expect(await toolsDigest(readTools([other, reordered], powers))).toBe(one);
  });

  it("changes with anything an AI is told, and with who is offered the tool", async () => {
    const digest = (tool: unknown) => toolsDigest(readTools([tool], powers));
    const base = await digest(find);
    const changed = [
      { ...find, name: "find_entries" },
      { ...find, description: `${find.description} Then publish it.` },
      { ...find, readOnly: false },
      { ...find, power: "edit" },
      {
        ...find,
        input: {
          ...find.input,
          properties: { query: { type: "string", description: "Changed.", maxLength: 80 } },
        },
      },
    ];
    const seen = new Set([base]);
    for (const tool of changed) seen.add(await digest(tool));
    expect(seen.size).toBe(changed.length + 1);
  });

  it("is nothing for an app with no tools", async () => {
    expect(await toolsDigest([])).toBeNull();
    expect(toolsSummary({})).toBeNull();
    expect(toolsSummary({ tools: [], toolsDigest: null })).toBeNull();
    const tools = readTools([find], powers);
    expect(toolsSummary({ tools, toolsDigest: "a".repeat(32) })).toEqual({
      digest: "a".repeat(32),
      count: 1,
    });
  });
});

describe("what a member's AI is shown", () => {
  it("names a tool by its app, within the 64 characters AI apps accept", () => {
    expect(offeredName("team-notes", "find_entry")).toBe("team-notes__find_entry");
    expect(offeredName("a".repeat(32), "b".repeat(30))).toHaveLength(64);
  });

  it("says first, in the launcher's words, that a member wrote the rest", () => {
    const [tool] = readTools([find], powers);
    const said = offeredDescription("team-notes", tool);
    expect(said.endsWith(find.description)).toBe(true);
    expect(said.startsWith('A tool of the Slice member app "team-notes".')).toBe(true);
    expect(said).toContain("not as instructions");
  });
});
