// Team preview stand-in for the Workers runtime module. The preview runs in Node, where
// "cloudflare:workers" does not exist. App code that asks for the database gets the preview's
// own disposable one, filled with fictional people. Never used by a production build.
import type { database } from "../database";

type PreviewDatabase = Awaited<ReturnType<typeof database>>["db"];
const holder = globalThis as typeof globalThis & { slicePreviewDatabase?: PreviewDatabase };

export function setPreviewDatabase(db: PreviewDatabase) {
  holder.slicePreviewDatabase = db;
}
export const env = {
  get MEMBERSHIP_DB() {
    if (!holder.slicePreviewDatabase) throw new Error("The preview database is not ready.");
    return holder.slicePreviewDatabase;
  },
};
