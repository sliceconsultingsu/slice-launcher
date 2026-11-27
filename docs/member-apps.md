# Member apps

A member app is an app a Slice member makes with their own AI and publishes through the launcher. There is no Git, pull request, build tool or Cloudflare account involved. Each app lives at its own address, `https://<id>.sliceos.app`, and is private to the person who made it until they share it.

Design: [member apps](superpowers/specs/2026-11-19-member-apps-design.md) and [the builder's kit](superpowers/specs/2026-11-19-app-builder-kit-design.md). Built-in apps (the alumni directory) are a different thing: they live in this repository under `platform/apps/` and are reviewed like any code. See [adding an app](adding-an-app.md).

**Status on November 24, 2026: apps made of screens are switched on. Server code is not.** There are two switches. The first turns on apps made of screens and needs no purchase; the maintainer [switched it on](#switching-member-apps-on) on November 24, 2026. The second lets an app include [server code and a database of its own](#server-code-and-a-database), needs Cloudflare's Workers for Platforms, and is off. No member has made an app yet; see [what has not been verified](#what-has-not-been-verified).

## What a member does

1. **Connect their AI** to Slice ([Connect your AI](connect-your-ai.md)).
2. **Start it on the Build page** (`/build`, beside Applications in the launcher). The member says what the app should help with, names it and says who it is for. That creates the app as a draft, reserving its ID and recording the member as the person who runs it, and the page writes a brief for their AI to paste. Or they skip the page and paste the general message from **Connect your AI**, and the AI creates the app itself with `slice_app_create`.
3. **Their AI builds it.** It reads the builder's guide (`slice_app_guide`), asks what the member is trying to solve, and calls `slice_app_publish` with the app's files. Published as a preview, only the member sees it; published for real, it is live at once, still for the member alone.
4. **Bring it live** from the Build page, which shows each of the member's apps as a draft, a preview, live or offline, with the next step beside it. ([Screenshots](images/build/README.md).)
5. **Share it** from the app's page in the launcher (**Details** on its tile): add people by name, give them extra powers, add another manager.
6. **Ask for Public** by choosing Public and saving. The app stays Private and the Slice owner is asked. When an owner saves it as Public, every active member gets it, and its managers can switch it either way from then on.

The same page shows every published version. The people who run the app can put an earlier version live, take the app offline (it keeps everything and opens for nobody), or delete it.

### Preview

A preview is a published version that only the people who run the app are shown, at the app's usual address. Everyone else keeps the live version, or sees nothing if nothing is live yet, so a first publish as a preview is a private draft. There is one preview at a time. The app's page shows it with **Make version N live** and **Discard preview**; publishing for real also replaces it. Until it is made live the app keeps the name, description and powers of the live version.

A preview's server code works on the app's real database. There is one database per app, not one per version.

## What an app can be

| Limit           | Value                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Kind            | Screens: HTML, CSS, JavaScript, images and fonts                                   |
| First screen    | `index.html` is required                                                           |
| File types      | html, css, js, mjs, json, txt, md, csv, svg, png, jpg, jpeg, gif, webp, ico, woff2 |
| Size            | 50 files, 512 KB each, 1 MB in one publish                                         |
| ID              | 3 to 32 lower-case letters, digits and single hyphens; permanent; never reused     |
| Apps per member | Five at a time (owners have no limit)                                              |
| Pace            | 30 publishes an hour and 10 new apps a day per member                              |
| Extra powers    | Up to 20, named by the app, given to people on the app's page                      |
| Guide           | Markdown, up to 20,000 characters, shown on the app's page                         |

**What it cannot do.** It cannot load from, call or post to any other site: no CDN scripts, web fonts, outside images or outside APIs. Until server code is switched on it also cannot save anything between visits or share data between the people using it, which makes screens-only apps good for calculators, checklists, reference pages and guides, and not for trackers or sign-up sheets.

**What an app knows about its user.** A page can fetch `/__slice/me` and gets `{ id, name, manager, powers }` for the signed-in member. It never gets an email address.

## Server code and a database

With the second switch on, an app can include one more file, `worker.js`: an ES module that answers every address under `/api/`. The launcher still answers everything else from the app's files.

- **Its own database.** `env.DB` is a SQLite database (Cloudflare D1) that belongs to that app alone and is the only thing its code can reach. It is made by the app's first version with server code and shared by every later version.
- **Who is asking.** The launcher adds `X-Slice-Member-Id`, `X-Slice-Member-Name` (percent-encoded), `X-Slice-Manager` and `X-Slice-Powers` to each request, after removing any the browser sent, along with every cookie and credential. The app's code decides who may read or change what.
- **No reaching out.** Every call the code makes to another address is refused by a separate outbound Worker. It holds no secrets.
- **Limits.** 50 ms of processing and 50 subrequests per request, and at most 1 MB in a request.
- **One Worker per publish.** Each version's code is uploaded under a name of its own, so putting an earlier version live runs exactly what was published then. The database is not versioned: an earlier version runs against today's data.
- **The answer is cleaned.** The launcher removes any cookie the code tries to set and applies the same browser rules as on every other response.

An app's code cannot be run on a developer's computer: Cloudflare's local runtime does not run dispatch namespaces. What the launcher does around the code is tested; what Cloudflare isolates is taken from its documentation until checked on the real account.

**Not built:** recent errors in `slice_app_status`, and removing a deleted app's Workers and database. Until there is a clean-up, the maintainer removes them by hand (they are tagged `slice-app:<id>` and named `slice-app-<id>`).

## The tools a builder's AI gets

Offered to every active member's connected AI while member apps are on:

| Tool                | Does                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| `slice_app_create`  | Reserves an ID and records the caller as the app's manager.                            |
| `slice_app_publish` | Stores a version's files and guide and puts it live.                                   |
| `slice_app_status`  | For the people who run an app: whether it is live, its versions, who it is shared with |
| `slice_app_list`    | The apps the caller runs, and how many more they can create.                           |
| `slice_app_guide`   | The builder's guide and a starter app. Changes nothing.                                |
| `slice_app_upload`  | A one-time address to send a larger app's files to from a terminal.                    |

`slice_app_publish` takes `"preview": true`.

**The builder's guide** tells an AI how to work with someone who has never built an app: ask what problem they are solving and who will use it, say plainly what an app cannot do, start small, publish a preview, then explain how to share. It carries the limits (taken from the code, so they cannot drift), a recipe for sending a folder of files, and a starter app: a first screen, a style sheet, a script and, when server code is on, a `worker.js` that keeps a list in the app's database with the checks in the right place. The starter's server code is run against a real local database in the tests.

**A larger app.** An AI that can run commands asks for an upload address and posts the same content as a publish to it. The address works once, for ten minutes, for one app and one member, and allows 100 files, 2 MB each, 5 MB in all. It is the credential, so it needs no browser session; membership and who runs the app are checked again when it is used.

The tools' descriptions carry the rules above, so an AI that has never seen this page can follow them. An AI cannot share an app, make it Public, take it offline or delete it: those are done by a person, on the app's page. Publishing happens only through these tools; the membership API refuses it. Creating an app, which only reserves its ID, can also be done by a person on the Build page, under the same limits: five apps at a time and ten new ones a day.

## How it is kept safe

- **Nothing an app publishes runs on Slice's servers.** The launcher stores each version's files in its own store and serves them itself. An app's files are data.
- **Every request is checked.** The launcher answers each app address itself. It signs the person in, then reloads membership and the app's settings on every request, so suspending someone, removing them, or taking them off an app applies on their next click.
- **An app's address is its own.** The launcher's session cookie is bound to the launcher's address and is never sent to an app. A signed-in person is carried to an app by a one-time pass that lasts a minute, works once, only at that app, and only in the browser that started the sign-in. The app's session is a separate cookie that ends when the launcher session it came from ends.
- **Apps cannot reach each other.** Another app's page, or any other site, can link to an app but cannot load, call or frame anything from it. A change is accepted only from the app's own pages.
- **Any other name under the launcher's host is nobody's.** `www.sliceos.app`, a name with a dot, a reserved name: all answer 404 and never reach the launcher's pages or sign-in.
- **Browser rules.** Every response from an app address carries a content policy that limits loading, calling and posting to the app's own address and forbids framing.
- **Only what was published is served.** A request is answered only if the live version's saved record lists that file. Each publish's files are kept under a key of their own, so two publishes at the same moment cannot overwrite each other.
- **Everything is recorded.** Creating, publishing, sharing, approving, taking offline and deleting each add an **Activity** entry.

### What this does not prevent

A page can always send its viewer to another address, and a browser policy cannot stop that. A dishonest app could therefore leak what it can itself see: its own content and the viewer's name and member ID. It can never see an email address, the launcher's session, the member list or another app's data. A page could also imitate a sign-in screen. This is why an app is shown to every member only after an owner's OK, why every version is kept, and why an owner can take any app offline at once.

## Where things are

| What                                  | Where                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Rules for IDs, limits                 | `platform/src/member-apps/rules.ts`, `publish.ts`                                                    |
| Create, publish, status, list         | `platform/src/member-apps/service.ts`, `tools.ts`                                                    |
| Sign-in across addresses              | `platform/src/member-apps/app-sessions.ts`, `pass-route.ts`                                          |
| Answering an app's address            | `platform/src/member-apps/front-door.ts`                                                             |
| Which requests are for an app address | `platform/src/platform/address.ts`, `src/ai-connections/oauth.ts`                                    |
| The registry, in the membership state | `platform/src/membership/domain.ts` (`memberapp.*` commands)                                         |
| Tables                                | `platform/migrations/0011_member_apps.sql`                                                           |
| The builder's guide and starter app   | `platform/src/member-apps/guide.ts`                                                                  |
| Upload addresses                      | `platform/src/member-apps/uploads.ts`, `upload-route.ts`, `platform/migrations/0012_app_uploads.sql` |
| The app's page and the tiles          | `platform/src/lib/member-about-view.tsx`, `member-app-model.ts`                                      |
| The Build page                        | `platform/app/build/page.tsx`, `platform/src/build/build-view.tsx`, `model.ts`                       |

A member app's settings are an ordinary app settings record, so [app access](membership.md#app-access) applies unchanged: Public or Private, people, extra powers, managers.

## Switching member apps on

These steps change production and need the maintainer. Steps 1 to 5 were done on November 24, 2026, on the maintainer's instruction. Step 6 has not been done.

1. **The launcher is at `https://sliceos.app`** ([the launcher's address](launcher-address.md), both steps).
2. **Apply migrations `0011_member_apps.sql` and `0012_app_uploads.sql`** through the [approved process](migrations.md). Until then the code behaves as if there were no member apps, and creating one answers 503. _Done: both applied, five new empty tables, nothing else changed._
3. **Create the file store.** `pnpm --filter @slice/launcher exec wrangler kv namespace create slice-app-files`, then add it to `platform/wrangler.jsonc` as the `APP_FILES` binding. Never share it with another app. _Done._
4. **Add the wildcard address.** In the `sliceos.app` zone add a proxied DNS record for `*` (an `AAAA` record to `100::` is the usual placeholder). Add the route `{ "pattern": "*.sliceos.app/*", "zone_name": "sliceos.app" }` to `platform/wrangler.jsonc`. The release token needs _Zone → Workers Routes → Edit_ for the zone, as it did for the launcher's own address. _Done. The DNS record is not in Git: it was added in the zone by hand, and the route does nothing without it. The zone's certificate already covered `*.sliceos.app`._
5. **Set `MEMBER_APPS_ENABLED` to `"true"`** in `platform/wrangler.jsonc`. Steps 3 to 5 are one pull request. _Done._
6. **Check with a real account.** Connect an AI, create and publish an app, open it, share it with a second member, ask for Public, approve as the owner, take it offline, delete it. Then try the refusals: a member who is not on the app, a suspended member, and the app's address in a private window.

To switch off again, set `MEMBER_APPS_ENABLED` back to `"false"`: app addresses answer 404 and the tools disappear. Apps, versions and files are kept.

The switch is for everyone at once. While it is on, every active member with a connected AI app is offered the app tools, within the limits above.

### Switching server code on

After the steps above, and only once Workers for Platforms is bought on the Cloudflare account ($25 a month at the time of writing):

1. **Create the dispatch namespace:** `pnpm --filter @slice/launcher exec wrangler dispatch-namespace create slice-apps`.
2. **Deploy the outbound Worker:** `pnpm --filter @slice/launcher exec wrangler deploy --config outbound/wrangler.jsonc`. It refuses every request and holds nothing.
3. **Create an API token** limited to this account with _Workers Scripts: Edit_ and _D1: Edit_, and store it and the account ID as secrets of the launcher: `wrangler secret put APPS_API_TOKEN` and `wrangler secret put APPS_ACCOUNT_ID`. Neither goes in Git.
4. **Bind the namespace** in `platform/wrangler.jsonc` through a pull request:

   ```jsonc
   "dispatch_namespaces": [
     { "binding": "APPS", "namespace": "slice-apps", "outbound": { "service": "slice-apps-outbound" } },
   ],
   ```

5. **Check on the real account**, because none of it could be tested locally. Publish an app whose `worker.js` tries each of these, and confirm each fails: call an outside address; read a cookie; read an `X-Slice-*` header the browser set; reach a binding other than `DB`; use another app's database. Then confirm it can create a table, write a row as one member and read it as another.

Without all of the binding and both secrets, a publish that includes `worker.js` is refused with "Server code is not switched on yet", and screens-only apps are unaffected.

## What has not been verified

Everything above is tested against a local Worker, a local database and a browser with made-up people. Server code is tested only up to the edge of Cloudflare: the upload request, the request the code receives and the answer the browser gets. That Cloudflare runs the code with only its own database, and that the outbound Worker sees every outside call, come from Cloudflare's documentation. Checked on November 24, 2026, when member apps were switched on: the zone's certificate covers `*.sliceos.app`, and a name under the launcher's host reaches Cloudflare. Not checked against production: the file store at production size, and a real AI app completing a publish (a publish is a far larger tool call than any other; clients may have limits of their own). Nor has a real AI been watched following the builder's guide with a real member, a signed-in person opened an app at its address, or an upload address been used from a terminal against production.

Publishing makes one store write per file. Cloudflare's documentation counts those as requests to its own services, limited to 1,000 for one request on the free plan and more on a paid one, so a 50-file publish fits. The file store's daily write allowance on the account's plan was not checked: on Cloudflare's free plan it is small enough that a day of heavy publishing could reach it.
