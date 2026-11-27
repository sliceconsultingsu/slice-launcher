import { describe, expect, it } from "vitest";
import type { Repository } from "../membership/repository";
import { describedFromRecord, liveCommand } from "./live";

const record = {
  name: "As published",
  description: "What it said.",
  powers: [{ id: "edit", label: "Edit" }],
};
const digest = "d".repeat(32);
const withTools = {
  ...record,
  tools: [{ name: "find", description: "Find.", readOnly: true, power: null, input: {} }],
  toolsDigest: digest,
};
const repository = {
  version: async (id: string, version: number) =>
    id !== "notes" ? null : version === 2 ? record : version === 3 ? withTools : null,
} as unknown as Repository;

describe("describing an app by the version made live", () => {
  it("takes the description from the version's saved record", async () => {
    expect(await liveCommand(repository, "notes", 2)).toEqual({
      type: "memberapp.live",
      id: "notes",
      version: 2,
      as: { ...record, tools: null },
    });
  });

  it("takes the version's tools from its record too, in short", async () => {
    expect((await liveCommand(repository, "notes", 3)).as).toEqual({
      ...record,
      tools: { digest, count: 1 },
    });
  });

  it("adds nothing when the app is taken offline or the version has no record", async () => {
    expect(await liveCommand(repository, "notes", null)).toEqual({
      type: "memberapp.live",
      id: "notes",
      version: null,
    });
    expect(await liveCommand(repository, "notes", 9)).not.toHaveProperty("as");
  });

  it("replaces whatever a browser sent as the description", async () => {
    // A fingerprint a browser sent could otherwise pass for the one an owner agreed to.
    const made = { name: "Made up", tools: { digest: "a".repeat(32), count: 1 } };
    const sent = { type: "memberapp.live", id: "notes", version: 2, as: made };
    expect(await describedFromRecord(repository, sent)).toMatchObject({
      as: { ...record, tools: null },
    });
  });

  it.each([
    ["another kind of change", { type: "memberapp.delete", id: "notes" }],
    ["a version that is not a whole number", { type: "memberapp.live", id: "notes", version: 1.5 }],
    ["a version of zero", { type: "memberapp.live", id: "notes", version: 0 }],
    ["a version sent as text", { type: "memberapp.live", id: "notes", version: "2" }],
    ["no app ID", { type: "memberapp.live", version: 2 }],
    ["something that is not a command", "memberapp.live"],
    ["nothing", null],
  ])("leaves %s exactly as it arrived, for the rules to judge", async (_what, sent) => {
    expect(await describedFromRecord(repository, sent)).toBe(sent);
  });
});
