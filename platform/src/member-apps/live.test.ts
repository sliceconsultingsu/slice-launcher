import { describe, expect, it } from "vitest";
import type { Repository } from "../membership/repository";
import { describedFromRecord, liveCommand } from "./live";

const record = {
  name: "As published",
  description: "What it said.",
  powers: [{ id: "edit", label: "Edit" }],
};
const repository = {
  version: async (id: string, version: number) => (id === "notes" && version === 2 ? record : null),
} as unknown as Repository;

describe("describing an app by the version made live", () => {
  it("takes the description from the version's saved record", async () => {
    expect(await liveCommand(repository, "notes", 2)).toEqual({
      type: "memberapp.live",
      id: "notes",
      version: 2,
      as: record,
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
    const sent = { type: "memberapp.live", id: "notes", version: 2, as: { name: "Made up" } };
    expect(await describedFromRecord(repository, sent)).toMatchObject({ as: record });
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
