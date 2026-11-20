import { describe, expect, it } from "vitest";
import { movedTo } from "./address";

const env = { LAUNCHER_ORIGIN: "https://slice.example", FORMER_HOSTS: "old.slice.example" };
const at = (address: string, config: Parameters<typeof movedTo>[1] = env) =>
  movedTo(new URL(address), config);

describe("sending a former address to the launcher's address", () => {
  it("keeps the path and query", () => {
    expect(at("https://old.slice.example/account?next=%2Fabout%2Falumni&x=1")).toBe(
      "https://slice.example/account?next=%2Fabout%2Falumni&x=1",
    );
    expect(at("https://old.slice.example/")).toBe("https://slice.example/");
  });

  it("serves the launcher's own address and addresses it was never told about", () => {
    expect(at("https://slice.example/account")).toBeNull();
    expect(at("https://localhost:8787/account")).toBeNull();
    expect(at("https://preview.slice.example/")).toBeNull();
  });

  it("does not match a host that only ends with, or contains, a former host", () => {
    expect(at("https://notold.slice.example/")).toBeNull();
    expect(at("https://old.slice.example.evil.test/")).toBeNull();
  });

  it("accepts several former hosts, in any case, with spaces or a trailing dot", () => {
    const several = { ...env, FORMER_HOSTS: " Old.Slice.Example. , older.slice.example ,," };
    expect(at("https://old.slice.example/a", several)).toBe("https://slice.example/a");
    expect(at("https://older.slice.example/b", several)).toBe("https://slice.example/b");
    expect(at("https://oldest.slice.example/c", several)).toBeNull();
  });

  it("matches a request whose host ends with a dot", () => {
    expect(at("https://old.slice.example./a")).toBe("https://slice.example/a");
  });
});

describe("leaving the old address serving when the setting is off or wrong", () => {
  it.each([
    ["no former hosts", { LAUNCHER_ORIGIN: "https://slice.example" }],
    ["an empty list", { LAUNCHER_ORIGIN: "https://slice.example", FORMER_HOSTS: "" }],
    ["no launcher address", { FORMER_HOSTS: "old.slice.example" }],
    ["an empty launcher address", { LAUNCHER_ORIGIN: "", FORMER_HOSTS: "old.slice.example" }],
    [
      "a launcher address that is not a web address",
      { LAUNCHER_ORIGIN: "slice.example", FORMER_HOSTS: "old.slice.example" },
    ],
    [
      "a plain HTTP launcher address",
      { LAUNCHER_ORIGIN: "http://slice.example", FORMER_HOSTS: "old.slice.example" },
    ],
    [
      "a launcher address with a path",
      { LAUNCHER_ORIGIN: "https://slice.example/app", FORMER_HOSTS: "old.slice.example" },
    ],
    [
      "a launcher address with a sign-in in it",
      { LAUNCHER_ORIGIN: "https://user:pw@slice.example", FORMER_HOSTS: "old.slice.example" },
    ],
    [
      "a launcher address that is itself a former host",
      { LAUNCHER_ORIGIN: "https://old.slice.example", FORMER_HOSTS: "old.slice.example" },
    ],
  ])("serves here with %s", (_name, config) => {
    expect(at("https://old.slice.example/account", config)).toBeNull();
  });
});
