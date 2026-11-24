import { describe, expect, it } from "vitest";
import { appAddress, appHost, movedTo } from "./address";

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

describe("telling a member app's address from the launcher's", () => {
  const name = (address: string, config: Parameters<typeof appHost>[1] = env) =>
    appHost(new URL(address), config);

  it("reads the app's ID from a name directly under the launcher's host", () => {
    expect(name("https://notes.slice.example/page.html")).toBe("notes");
    expect(name("https://team-tracker.slice.example/")).toBe("team-tracker");
    expect(name("https://NOTES.slice.example./")).toBe("notes");
  });

  it("is not an app address at the launcher's own host, or anywhere else", () => {
    expect(name("https://slice.example/")).toBeNull();
    expect(name("https://old.slice.example.evil.test/")).toBeNull();
    expect(name("https://notslice.example/")).toBeNull();
    expect(name("https://localhost:8787/")).toBeNull();
  });

  it.each([
    "https://a.b.slice.example/",
    "https://www.slice.example/",
    "https://admin.slice.example/",
    "https://ab.slice.example/",
    "https://my--notes.slice.example/",
    "https://1notes.slice.example/",
    "https://xn--nots-9ra.slice.example/",
  ])("is under the launcher's host but no app's address: %s", (address) => {
    expect(name(address)).toBe("");
  });

  it("knows no app addresses while the launcher's address is missing or wrong", () => {
    expect(name("https://notes.slice.example/", {})).toBeNull();
    expect(name("https://notes.slice.example/", { LAUNCHER_ORIGIN: "slice.example" })).toBeNull();
  });

  it("builds an app's address from the launcher's", () => {
    expect(appAddress("https://slice.example", "notes")).toBe("https://notes.slice.example");
    expect(appAddress("https://localhost:8787", "notes")).toBe("https://notes.localhost:8787");
  });
});
