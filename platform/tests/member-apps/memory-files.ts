// Test stand-in for the launcher's file store (src/member-apps/files.ts). Never used in production.
import type { AppFiles } from "../../src/member-apps/files";

export function memoryFiles(): AppFiles & { keys(): string[] } {
  const stored = new Map<string, { body: ArrayBuffer; type: string }>();
  const key = (appId: string, version: number, path: string) => `${appId}/${version}/${path}`;
  return {
    async put(appId, version, files) {
      for (const file of files)
        stored.set(key(appId, version, file.path), {
          body: file.body.slice().buffer as ArrayBuffer,
          type: file.type,
        });
    },
    async get(appId, version, path) {
      return stored.get(key(appId, version, path)) ?? null;
    },
    keys: () => [...stored.keys()].sort(),
  };
}
