// What the launcher hands a member's AI before it builds an app: how to work with someone who has
// never built one, the rules in one place, and a small starter app that already works. The
// numbers come from the code's own limits, so the guide cannot drift from what the launcher does.
import {
  MAX_TOOL_DESCRIPTION,
  MAX_TOOL_NAME,
  MAX_TOOL_RESULT_BYTES,
  MAX_TOOLS,
  TOOL_MILLISECONDS,
} from "./app-tools";
import { LARGE, MAX_BUNDLE_BYTES, MAX_FILE_BYTES, MAX_FILES, MAX_GUIDE } from "./publish";
import { APP_LIMIT } from "./rules";

const megabytes = (bytes: number) => `${bytes / (1024 * 1024)} MB`;

// The starter's files avoid template literals so they can sit in this file unescaped.
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My app</title>
    <link rel="stylesheet" href="css/site.css" />
  </head>
  <body>
    <header>
      <h1>My app</h1>
      <p id="greeting">Loading…</p>
    </header>
    <main id="main">
      <p>Replace this with what the app is for.</p>
    </main>
    <script src="js/app.js"></script>
  </body>
</html>
`;

const SERVER_INDEX_HTML = INDEX_HTML.replace(
  "      <p>Replace this with what the app is for.</p>",
  `      <form id="add">
        <label for="title">Add an item</label>
        <input id="title" name="title" maxlength="200" required />
        <button type="submit">Add</button>
      </form>
      <p id="status" role="status"></p>
      <ul id="items"></ul>`,
);

const SITE_CSS = `:root {
  --ink: #1d1d1b;
  --muted: #5f5b53;
  --line: #ddd8cf;
  --surface: #fffdf8;
  --page: #f9f8f5;
  --accent: #a0401c;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font:
    16px/1.5 system-ui,
    sans-serif;
}
header,
main {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
}
h1 {
  margin: 0 0 4px;
}
#greeting {
  margin: 0;
  color: var(--muted);
}
label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
input {
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
}
button {
  min-height: 44px;
  margin-top: 12px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button.quiet {
  margin: 0;
  background: none;
  color: var(--accent);
  text-decoration: underline;
}
ul {
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
li small {
  display: block;
  color: var(--muted);
}
`;

const APP_JS = `// Who is using the app. The launcher answers this; it never includes an email address.
fetch("/__slice/me")
  .then(function (response) {
    return response.json();
  })
  .then(function (me) {
    document.getElementById("greeting").textContent = "Hello, " + (me.name || "there") + ".";
  })
  .catch(function () {
    document.getElementById("greeting").textContent = "";
  });
`;

const SERVER_APP_JS = `// The app's pages talk to its own server code under /api/. Text from people is always put on
// the page with textContent, never innerHTML, so nothing they type can run as code.
var list = document.getElementById("items");
var statusLine = document.getElementById("status");

function show(data) {
  document.getElementById("greeting").textContent = "Hello, " + (data.me.name || "there") + ".";
  list.textContent = "";
  data.items.forEach(function (item) {
    var row = document.createElement("li");
    var text = document.createElement("span");
    text.textContent = item.title;
    var by = document.createElement("small");
    by.textContent = "Added by " + item.added_by_name;
    text.appendChild(by);
    row.appendChild(text);
    if (item.added_by === data.me.id || data.me.manager) {
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "quiet";
      remove.textContent = "Remove";
      remove.addEventListener("click", function () {
        send("/api/items/" + item.id, { method: "DELETE" });
      });
      row.appendChild(remove);
    }
    list.appendChild(row);
  });
}

function load() {
  return fetch("/api/items")
    .then(function (response) {
      if (!response.ok) throw new Error("load");
      return response.json();
    })
    .then(show)
    .catch(function () {
      statusLine.textContent = "The list could not be loaded. Refresh the page to try again.";
    });
}

function send(path, options) {
  statusLine.textContent = "";
  return fetch(path, options)
    .then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) throw new Error(body.error || "That did not work.");
      });
    })
    .then(load)
    .catch(function (error) {
      statusLine.textContent = error.message;
    });
}

document.getElementById("add").addEventListener("submit", function (event) {
  event.preventDefault();
  var input = document.getElementById("title");
  send("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: input.value }),
  }).then(function () {
    input.value = "";
  });
});

load();
`;

const WORKER_JS = `// The app's server code. It answers every address under /api/ for the app's pages, and the
// app's tools under /__slice/tools/ for a member's AI. The launcher has already checked that the
// person is a signed-in Slice member who may open this app, and tells this code who they are in
// the X-Slice-* headers. Who may change what is decided here, not on the page.
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

// One way to add an item, used by the page and by the tool, so both follow the same rules.
async function addItem(env, me, value) {
  const title = typeof value === "string" ? value.trim().slice(0, 200) : "";
  if (!title) return null;
  await env.DB.prepare(
    "INSERT INTO items (title, added_by, added_by_name, added_at) VALUES (?, ?, ?, ?)",
  )
    .bind(title, me.id, me.name, new Date().toISOString())
    .run();
  return title;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const me = {
      id: request.headers.get("X-Slice-Member-Id"),
      name: decodeURIComponent(request.headers.get("X-Slice-Member-Name") || ""),
      manager: request.headers.get("X-Slice-Manager") === "true",
    };
    // The database starts empty and is shared by every version of the app.
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, added_by TEXT NOT NULL, added_by_name TEXT NOT NULL, added_at TEXT NOT NULL)",
    ).run();

    if (url.pathname === "/api/items" && request.method === "GET") {
      const found = await env.DB.prepare(
        "SELECT id, title, added_by, added_by_name, added_at FROM items ORDER BY id DESC LIMIT 200",
      ).all();
      return json({ items: found.results, me: me });
    }

    if (url.pathname === "/api/items" && request.method === "POST") {
      const body = await request.json().catch(function () {
        return null;
      });
      if (!(await addItem(env, me, body && body.title)))
        return json({ error: "Give the item a title." }, 400);
      return json({ ok: true }, 201);
    }

    const one = /^\\/api\\/items\\/(\\d+)$/.exec(url.pathname);
    if (one && request.method === "DELETE") {
      const item = await env.DB.prepare("SELECT added_by FROM items WHERE id = ?")
        .bind(Number(one[1]))
        .first();
      if (!item) return json({ error: "That item is gone." }, 404);
      // Only the person who added an item, or someone who runs the app, may remove it.
      if (item.added_by !== me.id && !me.manager)
        return json({ error: "Only the person who added this can remove it." }, 403);
      await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(Number(one[1])).run();
      return json({ ok: true });
    }

    // Tools for a member's AI, as listed in "tools" when publishing. No page can reach
    // /__slice/tools/: a request here is always the launcher passing on a tool call, for a
    // person it has already checked. The input is JSON; the answer is a JSON object.
    if (url.pathname === "/__slice/tools/list_items" && request.method === "POST") {
      const found = await env.DB.prepare(
        "SELECT id, title, added_by_name, added_at FROM items ORDER BY id DESC LIMIT 50",
      ).all();
      return json({ items: found.results });
    }

    if (url.pathname === "/__slice/tools/add_item" && request.method === "POST") {
      const input = await request.json().catch(function () {
        return null;
      });
      const added = await addItem(env, me, input && input.title);
      // A 4xx answer with an error is passed to the AI in these words.
      if (!added) return json({ error: "Give the item a title." }, 400);
      return json({ added: added });
    }

    return json({ error: "Not found." }, 404);
  },
};
`;

/** The tools the starter's worker.js answers, as they are sent in "tools" when publishing. */
const STARTER_TOOLS = [
  {
    name: "list_items",
    description: "List the newest items on this app's shared list, with who added each and when.",
    readOnly: true,
  },
  {
    name: "add_item",
    description: "Add one item to this app's shared list, as the signed-in member.",
    readOnly: false,
    input: {
      type: "object",
      properties: {
        title: { type: "string", description: "The item, up to 200 characters.", maxLength: 200 },
      },
      required: ["title"],
    },
  },
];

const FOLDER_RECIPE = `python3 - <<'PY' > bundle.json
import base64, json, os, sys
root = "app"  # the folder that holds index.html
text = {".html", ".css", ".js", ".mjs", ".json", ".txt", ".md", ".csv", ".svg"}
files = []
for folder, _, names in os.walk(root):
    for name in names:
        path = os.path.join(folder, name)
        relative = os.path.relpath(path, root).replace(os.sep, "/")
        data = open(path, "rb").read()
        if os.path.splitext(name)[1].lower() in text:
            files.append({"path": relative, "text": data.decode("utf-8")})
        else:
            files.append({"path": relative, "base64": base64.b64encode(data).decode("ascii")})
json.dump({
    "name": "The app's name",
    "description": "One line on what it is for.",
    "guide": open("GUIDE.md", encoding="utf-8").read(),
    "files": files,
}, sys.stdout)
PY
curl -sS -X POST -H "Content-Type: application/json" --data-binary @bundle.json "THE ADDRESS FROM slice_app_upload"`;

const TOOLS_SECTION = `## Tools for a member's AI

An app with worker.js can offer tools: things the AI of the people it is shared with can do in the app, such as finding an entry or adding one. Offer them only if the member wants the app used that way; most apps need none.

- List them in "tools" when you publish, up to ${MAX_TOOLS}: { "name", "description", "readOnly", "power" (optional), "input" (optional) }. The name is up to ${MAX_TOOL_NAME} lower-case letters, digits and underscores. The description is for the AI that will call it, up to ${MAX_TOOL_DESCRIPTION} characters: say what the tool does and nothing else. "readOnly" is false if calling it can change anything. "power" is one of the app's powers; leave it out for everyone who can open the app.
- "input" is a JSON Schema object: { "type": "object", "properties": { ... }, "required": [ ... ] }. Supported: type, description, enum, minimum, maximum, minLength, maxLength, properties, required, items, minItems, maxItems. The launcher checks each call against it and accepts only the fields it names.
- The launcher offers each tool as "<app id>__<name>" and sends a call to worker.js as POST /__slice/tools/<name>, with the input as JSON and the same X-Slice-* headers as any request. Answer with a JSON object of up to ${MAX_TOOL_RESULT_BYTES / 1024} KB within ${TOOL_MILLISECONDS / 1000} seconds. To refuse, answer with a 4xx status and { "error": "..." }: the AI is shown those words.
- No page can reach /__slice/tools/, so a request there is always a tool call. Decide in worker.js who may read or change what, exactly as for /api/, and use the same functions for both.
- **A Slice owner has to agree first.** Until an owner approves the tools on the app's page in the launcher, only the people named as running the app are offered them. Changing a tool's name, description, input or power needs the owner's OK again; changing worker.js or the screens does not. Settle the words with the member before they ask, and tell them this is how it works. You cannot approve tools for them.

`;

function guideText(server: boolean): string {
  const data = server
    ? `An app can save and share data. Add one file named worker.js: an ES module, \`export default { async fetch(request, env) { ... } }\`, that answers every address under /api/. \`env.DB\` is the app's own database (SQLite, through Cloudflare D1) and the only thing worker.js can reach. It starts empty and is shared by every version of the app, so create tables with CREATE TABLE IF NOT EXISTS and keep existing data working when you change them. Each request carries who is asking, set by the launcher: X-Slice-Member-Id, X-Slice-Member-Name (percent-encoded), X-Slice-Manager and X-Slice-Powers. Trust those and nothing else. Decide in worker.js who may read or change what. worker.js cannot call any other service, holds no secrets, gets 50 ms of processing per request and at most 1 MB per request. The starter's worker.js shows the pattern.`
    : `An app cannot save anything between visits, share data between people or offer tools to an AI yet: there is no server code and no database. If the member needs a tracker, a sign-up sheet or anything two people both see, say so plainly and offer what is possible now (a calculator, a checklist for one sitting, a reference page, a guide). Do not use localStorage as if it were shared storage.`;
  return `# Building a Slice app with a member

You are helping a member of Slice Consulting make an app. They may never have built one. Your job is the building; theirs is knowing the problem.

## How to work with them

1. **Ask what problem they are solving, and who will use it.** One question at a time. Find out what people need to see and do, and whether anything has to be saved or shared between people.
2. **Say plainly what an app cannot do** before you build, if their idea needs it. See "What an app is" below.
3. **Start with the smallest thing that helps.** One screen that does one job. Add to it after they have used it.
4. **Create the app** with slice_app_create. Agree the ID with them first: it is permanent and becomes the app's address.
5. **Publish a preview** with slice_app_publish and "preview": true. Give them the address and ask them to try it. Only the people who run the app see a preview.
6. **Change it until they are happy**, publishing a new preview each time.
7. **Publish it for real** by publishing again without "preview", or have them choose "Make it live" on the app's page.
8. **Tell them how to share it.** In the launcher, the app's tile has a Details button. On that page they add people by name, give extra powers, and add another manager. To show it to every member they choose Public and save; the Slice owner is asked and it stays Private until they agree. You cannot share the app for them.
9. **Write the guide** you send with each publish for the people the app will be shared with: what it is for and how to use it, in plain words.

## What an app is

- Screens: HTML, CSS, JavaScript, images and fonts, with index.html as the first screen. No build step.
- ${data}
- Pages can load, call and post only to the app's own address. Nothing from other sites works: no CDN scripts, web fonts, outside images or outside APIs. Put everything in the app's files.
- Only signed-in Slice members the app is shared with can open it. A page can fetch "/__slice/me" for { id, name, manager, preview, powers }. An app is never told an email address.
- "powers" are extra abilities the member can give to named people on the app's page. Name them in the publish; read them from /__slice/me${server ? " or X-Slice-Powers" : ""}.
- Put text people typed onto the page with textContent, never innerHTML.

## Limits

- Through slice_app_publish: ${MAX_FILES} files, ${MAX_FILE_BYTES / 1024} KB per file, ${megabytes(MAX_BUNDLE_BYTES)} in total.
- Through an upload address: ${LARGE.files} files, ${megabytes(LARGE.fileBytes)} per file, ${megabytes(LARGE.bundleBytes)} in total.
- File types: html, css, js, mjs, json, txt, md, csv, svg, png, jpg, jpeg, gif, webp, ico, woff2.
- The guide: Markdown, up to ${MAX_GUIDE.toLocaleString("en-US")} characters.
- A member can have ${APP_LIMIT} apps at a time.

## A larger app, from a folder

If you can run commands and the app is too large to type into one call, write its files in a folder, ask for a one-time address with slice_app_upload, and send them. The address works once, for ten minutes.

\`\`\`
${FOLDER_RECIPE}
\`\`\`

${server ? TOOLS_SECTION : ""}## The starter app

"starter" in this result is a small app that already works. Adapt it instead of starting from nothing: keep its structure, replace its content.${server ? ' "starterTools" is what to send as "tools" for the two tools its worker.js answers; leave it out for an app that offers none.' : ""}

## If something is refused

The launcher's refusals say what is wrong in a sentence. Fix that and try again; do not work around it. If the member needs something an app cannot do, tell them and suggest they ask the Slice owner.`;
}

export interface BuilderGuide {
  guide: string;
  starter: { path: string; text: string }[];
  /** What to send as "tools" for the starter's tools. Only with server code. */
  starterTools?: typeof STARTER_TOOLS;
}

/** The guide and the starter app, for an app with or without server code. */
export function builderGuide(options: { server: boolean }): BuilderGuide {
  return {
    guide: guideText(options.server),
    ...(options.server ? { starterTools: STARTER_TOOLS } : {}),
    starter: options.server
      ? [
          { path: "index.html", text: SERVER_INDEX_HTML },
          { path: "css/site.css", text: SITE_CSS },
          { path: "js/app.js", text: SERVER_APP_JS },
          { path: "worker.js", text: WORKER_JS },
        ]
      : [
          { path: "index.html", text: INDEX_HTML },
          { path: "css/site.css", text: SITE_CSS },
          { path: "js/app.js", text: APP_JS },
        ],
  };
}
