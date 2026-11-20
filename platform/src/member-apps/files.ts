// The launcher's own store for the files of every published version of a member app. The
// launcher writes here when a version is published and reads here to answer an app's address;
// an app's own code never has access to it.
//
// Files are kept per publish, under a key unique to that publish (VersionRecord.store), not per
// version number: two publishes at the same moment would both be "the next version", and only
// one of them is saved. The other's files stay under their own key and are never served.

export interface StoredFile {
  /** Relative to the app's address, e.g. "index.html" or "css/site.css". */
  path: string;
  /** The Content-Type the launcher serves it with. */
  type: string;
  body: Uint8Array;
}

export interface AppFiles {
  put(appId: string, store: string, files: readonly StoredFile[]): Promise<void>;
  get(
    appId: string,
    store: string,
    path: string,
  ): Promise<{ body: ArrayBuffer; type: string } | null>;
}

// App IDs and store keys cannot contain "/", so one app's keys never run into another's.
const key = (appId: string, store: string, path: string) => `${appId}/${store}/${path}`;

/** The store in production: one Cloudflare KV entry per file. */
export function kvFiles(kv: KVNamespace): AppFiles {
  return {
    async put(appId, store, files) {
      await Promise.all(
        files.map((file) =>
          kv.put(key(appId, store, file.path), file.body.slice().buffer as ArrayBuffer, {
            metadata: { type: file.type },
          }),
        ),
      );
    },
    async get(appId, store, path) {
      const found = await kv.getWithMetadata<{ type: string }>(
        key(appId, store, path),
        "arrayBuffer",
      );
      if (!found.value) return null;
      return { body: found.value, type: found.metadata?.type ?? "application/octet-stream" };
    },
  };
}
