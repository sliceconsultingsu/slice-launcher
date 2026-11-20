import { describe, expect, it } from "vitest";
import {
  appFiles,
  launcherOrigin,
  memberAppRequest,
  memberAppsEnabled,
  memberAppsService,
} from "./runtime";

const kv = { put: async () => {}, getWithMetadata: async () => ({ value: null, metadata: null }) };
const base = {
  MEMBER_APPS_ENABLED: "true",
  LAUNCHER_ORIGIN: "https://slice.example",
  APP_FILES: kv as unknown as KVNamespace,
  MEMBERSHIP_DB: {} as D1Database,
};
const request = new Request("https://elsewhere.example/api/membership");
const dispatcher = {
  get: () => ({ fetch: async () => new Response("hi") }),
} as unknown as DispatchNamespace;

describe("whether member apps are switched on", () => {
  it("is on only when the setting is exactly true and the file store is bound", () => {
    expect(memberAppsEnabled(base)).toBe(true);
    expect(memberAppsEnabled({ ...base, MEMBER_APPS_ENABLED: "false" })).toBe(false);
    expect(memberAppsEnabled({ ...base, MEMBER_APPS_ENABLED: "TRUE" })).toBe(false);
    expect(memberAppsEnabled({ ...base, MEMBER_APPS_ENABLED: undefined })).toBe(false);
    expect(memberAppsEnabled({ ...base, APP_FILES: undefined })).toBe(false);
  });

  it("offers no file store, no tools and no app addresses while off", () => {
    const off = { ...base, MEMBER_APPS_ENABLED: "false" };
    expect(appFiles(off)).toBeNull();
    expect(memberAppsService(request, off)).toBeUndefined();
    expect(memberAppRequest(new Request("https://notes.slice.example/"), off, "notes")).toBeNull();
    expect(memberAppsService(request, base)).toBeDefined();
  });

  it("uses the configured launcher address, or the request's when it is missing or wrong", () => {
    expect(launcherOrigin(request, base)).toBe("https://slice.example");
    for (const value of [
      undefined,
      "",
      "slice.example",
      "http://slice.example",
      "https://slice.example/x",
    ])
      expect(launcherOrigin(request, { ...base, LAUNCHER_ORIGIN: value })).toBe(
        "https://elsewhere.example",
      );
  });
});

describe("whether an app can have server code", () => {
  const on = { ...base, APPS: dispatcher, APPS_ACCOUNT_ID: "acct", APPS_API_TOKEN: "token" };

  it("needs the dispatch namespace, the account and the token, all three", () => {
    expect(memberAppsService(request, on)!.serverEnabled).toBe(true);
    expect(memberAppsService(request, base)!.serverEnabled).toBe(false);
    expect(memberAppsService(request, { ...on, APPS: undefined })!.serverEnabled).toBe(false);
    expect(memberAppsService(request, { ...on, APPS_ACCOUNT_ID: "" })!.serverEnabled).toBe(false);
    expect(memberAppsService(request, { ...on, APPS_API_TOKEN: undefined })!.serverEnabled).toBe(
      false,
    );
  });
});
