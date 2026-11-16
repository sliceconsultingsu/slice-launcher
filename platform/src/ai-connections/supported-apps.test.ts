import { describe, expect, it } from "vitest";
import { cleanName, returnTarget } from "./supported-apps";

describe("return addresses", () => {
  it("recognizes the hosted AI apps Slice supports", () => {
    expect(returnTarget("https://claude.ai/api/mcp/auth_callback")).toEqual({
      kind: "hosted",
      app: "Claude",
    });
    expect(returnTarget("https://claude.com/api/mcp/auth_callback")).toEqual({
      kind: "hosted",
      app: "Claude",
    });
    for (const address of [
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "https://chatgpt.com/connector/oauth/abc_123-XYZ",
    ])
      expect(returnTarget(address), address).toEqual({ kind: "hosted", app: "ChatGPT" });
  });

  it("recognizes apps on the person's own computer", () => {
    for (const address of [
      "http://127.0.0.1:5555/cb",
      "http://localhost:8080/callback",
      "http://[::1]:9000/cb",
      "https://localhost:8443/cb",
    ])
      expect(returnTarget(address)).toEqual({ kind: "local" });
  });

  it("does not recognize other HTTPS addresses, however much they resemble a checked app", () => {
    for (const address of [
      "https://attacker.example/cb",
      "https://claude.ai.attacker.example/cb",
      "https://attacker.example/claude.ai",
      "https://claude.ai:8443/api/mcp/auth_callback",
      // Only the exact sign-in address counts, not the rest of a checked app's site.
      "https://claude.ai/",
      "https://claude.ai/redirect",
      "https://claude.ai/api/mcp/auth_callback/extra",
      "https://claude.ai/api/mcp/auth_callback?next=https://attacker.example",
      "https://claude.ai/api/mcp/auth_callback#fragment",
      "https://claude.ai/api/mcp/../mcp/auth_callback",
      "https://claude.ai/api/mcp/%61uth_callback",
      "https://CLAUDE.AI/api/mcp/auth_callback",
      "https://chatgpt.com/connector/oauth/",
      "https://chatgpt.com/connector/oauth/abc/def",
      "https://chatgpt.com/connector/oauth/..%2F..%2Fshare",
      "https://chatgpt.com/share/abc",
      "https://xn--clade-0ra.ai/cb",
    ])
      expect(returnTarget(address), address).toEqual({ kind: "unrecognized" });
  });

  it("refuses addresses that may not be used at all", () => {
    for (const address of [
      "http://claude.ai/api/mcp/auth_callback",
      "https://claude.ai@attacker.example/cb",
      "https://user:pass@claude.ai/cb",
      "http://127.0.0.1.attacker.example/cb",
      "http://localhost.attacker.example/cb",
      "javascript:alert(1)",
      "cursor://anysphere.cursor/callback",
      "not a url",
      "",
      null,
      undefined,
      42,
    ])
      expect(returnTarget(address), String(address)).toBeNull();
  });
});

describe("app names", () => {
  it("keeps ordinary names, including accented and non-Latin ones", () => {
    expect(cleanName("  Claude  ")).toBe("Claude");
    expect(cleanName("Señor Búho 研究")).toBe("Señor Búho 研究");
  });

  it("removes characters that reverse, hide or break text", () => {
    expect(cleanName("Claude‮gpt.exe")).toBe("Claude gpt.exe");
    expect(cleanName("Cl​aude⁦⁩")).toBe("Cl aude");
    expect(cleanName("Line one\nLine two three\u0000")).toBe("Line one Line two three");
  });

  it("is empty when nothing printable is left or the value is not text", () => {
    expect(cleanName("‮​ \u0007")).toBe("");
    expect(cleanName(undefined)).toBe("");
    expect(cleanName(7)).toBe("");
  });

  it("cuts long names without splitting a character", () => {
    const cut = cleanName("😀".repeat(200));
    expect([...cut]).toHaveLength(80);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.slice(0, 2)).toBe("😀");
  });
});
