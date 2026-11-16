// Team preview stand-in for the Workers runtime module. The preview runs in Node, where
// "cloudflare:workers" does not exist. App code that asks for the database gets the preview's
// own disposable one, filled with fictional people. Never used by a production build.
import type { database } from "../database";

type PreviewDatabase = Awaited<ReturnType<typeof database>>["db"];
const holder = globalThis as typeof globalThis & { slicePreviewDatabase?: PreviewDatabase };

export function setPreviewDatabase(db: PreviewDatabase) {
  holder.slicePreviewDatabase = db;
}
/** Emails "sent" in the preview. They go nowhere: this list is all that happens to them. */
export const previewOutbox: { to: string; subject: string }[] = [];

export const env = {
  // A stand-in mail service, so the confirmation screens can be tried without sending anything.
  ALUMNI_EMAIL: {
    async send(message: { to: string; subject: string }) {
      previewOutbox.push({ to: message.to, subject: message.subject });
      return { messageId: `preview-${previewOutbox.length}` };
    },
  },
  ALUMNI_EMAIL_FROM: "alumni@example.com",
  get MEMBERSHIP_DB() {
    if (!holder.slicePreviewDatabase) throw new Error("The preview database is not ready.");
    return holder.slicePreviewDatabase;
  },
};
