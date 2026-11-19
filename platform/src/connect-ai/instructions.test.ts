import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agentInstructions, connectionAddress } from "./instructions";

const config = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");

describe("the address Slice gives people and their AI", () => {
  it("is the launcher's own address", () => {
    expect(connectionAddress).toBe("https://sliceos.app/mcp");
    expect(agentInstructions).toContain("https://sliceos.app/account");
    expect(agentInstructions).toContain(connectionAddress);
  });

  it("no longer names the retired address", () => {
    expect(agentInstructions).not.toContain("workers.dev");
  });

  it("matches the address the Worker is configured to send people to", () => {
    const origin = /"LAUNCHER_ORIGIN":\s*"([^"]+)"/.exec(config)?.[1];
    expect(connectionAddress).toBe(`${origin}/mcp`);
    expect(/"FORMER_HOSTS":\s*"([^"]*)"/.exec(config)?.[1]).toBe(
      "slice-launcher.ivan27chen.workers.dev",
    );
  });
});
