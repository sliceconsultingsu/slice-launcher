// Test stand-in for the launcher's file store (src/member-apps/files.ts). Never used in production.
import type { AppFiles } from "../../src/member-apps/files";

export function memoryFiles(): AppFiles & { keys(): string[] } {
  const stored = new Map<string, { body: ArrayBuffer; type: string }>();
  const key = (appId: string, store: string, path: string) => `${appId}/${store}/${path}`;
  return {
    async put(appId, store, files) {
      for (const file of files)
        stored.set(key(appId, store, file.path), {
          body: file.body.slice().buffer as ArrayBuffer,
          type: file.type,
        });
    },
    async get(appId, store, path) {
      return stored.get(key(appId, store, path)) ?? null;
    },
    keys: () => [...stored.keys()].sort(),
  };
}
