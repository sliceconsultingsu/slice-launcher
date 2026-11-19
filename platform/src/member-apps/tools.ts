// The four tools a member's connected AI uses to make an app (docs/member-apps.md). Their
// descriptions are the instructions the AI works from, so they say exactly what an app can be.
// Sharing is not here on purpose: who can open an app is decided by a person, on the app's page.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MembershipError } from "../membership/contracts";
import type { Identity } from "../membership/contracts";
import { MAX_GUIDE } from "./publish";
import type { MemberApps } from "./service";

/** The largest request the AI connection reads when member apps are on: one publish. */
export const MAX_PUBLISH_REQUEST_BYTES = 2_000_000;

const CREATE = `Create a new Slice app for the signed-in member, who becomes the person who runs it. Call this once, before publishing. The app is private to them until they share it from its page in the launcher; you cannot share it for them.

The ID is permanent and becomes the app's address (https://<id>.<Slice's host>): 3 to 32 lower-case letters, digits and single hyphens, starting with a letter. Ask the member what to call the app if they have not said. Then call slice_app_publish.`;

const SCREENS_ONLY = `- Screens only: HTML, CSS, JavaScript and images, sent here as files. There is no server code and no database yet, so an app cannot save anything between visits or share data between people. Do not use localStorage as if it were shared storage, and tell the member plainly if what they want needs saved data.`;

const WITH_SERVER = `- Screens (HTML, CSS, JavaScript and images, sent here as files) and, when the app needs to save or share data, server code: one extra file named worker.js.
- worker.js is an ES module: export default { async fetch(request, env) { ... } }. It answers every address under /api/; the launcher answers everything else from the app's files. Pages call it with fetch("/api/...").
- env.DB is the app's own database, and the only thing worker.js can reach. It is SQLite (Cloudflare D1): await env.DB.prepare("SELECT ... WHERE id = ?").bind(id).all(), .first() or .run(). It starts empty and is shared by every version of the app, so create tables with CREATE TABLE IF NOT EXISTS before using them, and keep existing data working when you change them.
- Every request to worker.js carries who is asking, set by the launcher: X-Slice-Member-Id, X-Slice-Member-Name (percent-encoded), X-Slice-Manager ("true" or "false") and X-Slice-Powers (comma-separated). Trust these and nothing else; there are no cookies. Decide in worker.js who may read or change what, and check it there, not only on the page.
- worker.js cannot call any other service (fetch to another address is refused), holds no secrets, gets 50 ms of processing per request, and receives at most 1 MB per request. Changes (POST, PUT, DELETE) are accepted only from the app's own pages.
- An app with nothing to save needs no worker.js. Do not use localStorage as if it were shared storage.`;

const publish = (
  server: boolean,
) => `Publish a version of an app the member runs. It goes live at once, at the app's own address, for the people the member has shared it with. Every version is kept, and publishing again replaces what is live.

What an app is, in this release:
${server ? WITH_SERVER : SCREENS_ONLY}
- index.html is required and is the first screen. Folders are fine ("css/site.css"); "folder/" serves "folder/index.html".
- Allowed file types: html, css, js, mjs, json, txt, md, csv, svg, png, jpg, jpeg, gif, webp, ico, woff2. Send text files as "text" and images or fonts as "base64".
- Limits: 50 files, 512 KB per file, 1 MB in total.
- Pages can load, call and post only to the app's own address. Nothing from other sites works: no CDN scripts, web fonts, outside images or outside APIs. Put everything the app needs in its files.
- Only signed-in Slice members the member has shared the app with can open it. A page can fetch "/__slice/me" to learn who is using it: { id, name, manager, powers }. It never gets an email address.
- "powers" are optional extra abilities the member can give to named people on the app's page (for example { "id": "edit", "label": "Edit entries" }); they appear in /__slice/me.

"guide" is Markdown shown on the app's page in the launcher: what the app is for and how to use it, written for the people it will be shared with.`;

const STATUS = `Where one app stands, for the member who runs it: whether it is live, its address, its versions, who it is shared with in numbers, and whether it is waiting for the Slice owner's OK to be shown to every member.`;

const LIST = `The Slice apps the signed-in member runs, with their addresses, and how many more they can create.`;

const file = z
  .object({
    path: z.string().describe('Relative path, for example "index.html" or "css/site.css".'),
    text: z.string().optional().describe("The file's contents, for text files."),
    base64: z.string().optional().describe("The file's contents in base64, for images and fonts."),
  })
  .strict();

export function registerMemberAppTools(server: McpServer, service: MemberApps, identity: Identity) {
  /** Runs one call. A refusal the launcher worded for the AI is passed on; nothing else is. */
  const run = async (work: () => Promise<Record<string, unknown>>) => {
    try {
      const value = await work();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(value) }],
        structuredContent: value,
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              error instanceof MembershipError
                ? error.message
                : "The launcher could not do this just now. Try again in a moment.",
          },
        ],
      };
    }
  };
  const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const reads = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

  server.registerTool(
    "slice_app_create",
    {
      description: CREATE,
      inputSchema: z
        .object({
          id: z.string().describe("The app's permanent ID and address, for example team-tracker."),
          name: z.string().describe("The app's name, up to 80 characters."),
          description: z.string().describe("One line on what it is for, up to 200 characters."),
        })
        .strict(),
      annotations: writes,
    },
    (input) => run(() => service.create(identity, input)),
  );
  server.registerTool(
    "slice_app_publish",
    {
      description: publish(service.serverEnabled),
      inputSchema: z
        .object({
          id: z.string().describe("The ID of an app the member runs."),
          name: z.string(),
          description: z.string(),
          guide: z.string().describe(`Markdown, up to ${MAX_GUIDE} characters.`),
          powers: z.array(z.object({ id: z.string(), label: z.string() }).strict()).optional(),
          files: z.array(file),
        })
        .strict(),
      annotations: writes,
    },
    ({ id, ...bundle }) => run(() => service.publish(identity, id, bundle)),
  );
  server.registerTool(
    "slice_app_status",
    {
      description: STATUS,
      inputSchema: z.object({ id: z.string() }).strict(),
      annotations: reads,
    },
    ({ id }) => run(() => service.status(identity, id)),
  );
  server.registerTool(
    "slice_app_list",
    { description: LIST, inputSchema: z.object({}).strict(), annotations: reads },
    () => run(() => service.list(identity)),
  );
}
