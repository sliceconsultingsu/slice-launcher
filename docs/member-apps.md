# Member apps

A member app is an app a Slice member makes with their own AI and publishes through the launcher. There is no Git, pull request, build tool or Cloudflare account involved. Each app lives at its own address, `https://<id>.sliceos.app`, and is private to the person who made it until they share it.

Design: [member apps](superpowers/specs/2026-11-19-member-apps-design.md). Built-in apps (the alumni directory) are a different thing: they live in this repository under `platform/apps/` and are reviewed like any code. See [adding an app](adding-an-app.md).

**Status on November 19, 2026: the code is released switched off.** Nothing here is available to members until the maintainer [switches it on](#switching-member-apps-on). This release covers apps made of screens only. Server code and a private database per app are the next release, and need Cloudflare's Workers for Platforms.

## What a member does

1. **Connect their AI** to Slice ([Connect your AI](connect-your-ai.md)).
2. **Ask it for an app.** The AI calls `slice_app_create`, which reserves the app's ID and records the member as the person who runs it, then `slice_app_publish` with the app's files. It is live at once, for the member alone.
3. **Share it** from the app's page in the launcher (**Details** on its tile): add people by name, give them extra powers, add another manager.
4. **Ask for Public** by choosing Public and saving. The app stays Private and the Slice owner is asked. When an owner saves it as Public, every active member gets it, and its managers can switch it either way from then on.

The same page shows every published version. The people who run the app can put an earlier version live, take the app offline (it keeps everything and opens for nobody), or delete it.

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

**What it cannot do yet.** An app has no server code and no database, so it cannot save anything between visits or share data between the people using it. It cannot load from, call or post to any other site: no CDN scripts, web fonts, outside images or outside APIs. That makes this release good for calculators, checklists, reference pages and guides, and not yet for trackers or sign-up sheets. Those need the next release.

**What an app knows about its user.** A page can fetch `/__slice/me` and gets `{ id, name, manager, powers }` for the signed-in member. It never gets an email address.

## The tools a builder's AI gets

Offered to every active member's connected AI while member apps are on:

| Tool                | Does                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| `slice_app_create`  | Reserves an ID and records the caller as the app's manager.                            |
| `slice_app_publish` | Stores a version's files and guide and puts it live.                                   |
| `slice_app_status`  | For the people who run an app: whether it is live, its versions, who it is shared with |
| `slice_app_list`    | The apps the caller runs, and how many more they can create.                           |

The tools' descriptions carry the rules above, so an AI that has never seen this page can follow them. An AI cannot share an app, make it Public, take it offline or delete it: those are done by a person, on the app's page. Creating and publishing happen only through these tools; the membership API refuses both.

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

| What                                  | Where                                                             |
| ------------------------------------- | ----------------------------------------------------------------- |
| Rules for IDs, limits                 | `platform/src/member-apps/rules.ts`, `publish.ts`                 |
| Create, publish, status, list         | `platform/src/member-apps/service.ts`, `tools.ts`                 |
| Sign-in across addresses              | `platform/src/member-apps/app-sessions.ts`, `pass-route.ts`       |
| Answering an app's address            | `platform/src/member-apps/front-door.ts`                          |
| Which requests are for an app address | `platform/src/platform/address.ts`, `src/ai-connections/oauth.ts` |
| The registry, in the membership state | `platform/src/membership/domain.ts` (`memberapp.*` commands)      |
| Tables                                | `platform/migrations/0011_member_apps.sql`                        |
| The app's page and the tiles          | `platform/src/lib/member-about-view.tsx`, `member-app-model.ts`   |

A member app's settings are an ordinary app settings record, so [app access](membership.md#app-access) applies unchanged: Public or Private, people, extra powers, managers.

## Switching member apps on

These steps change production and need the maintainer. None has been done.

1. **The launcher is at `https://sliceos.app`** ([the launcher's address](launcher-address.md), both steps).
2. **Apply migration `0011_member_apps.sql`** through the [approved process](migrations.md). Until then the code behaves as if there were no member apps, and creating one answers 503.
3. **Create the file store.** `pnpm --filter @slice/launcher exec wrangler kv namespace create slice-app-files`, then add it to `platform/wrangler.jsonc` as the `APP_FILES` binding. Never share it with another app.
4. **Add the wildcard address.** In the `sliceos.app` zone add a proxied DNS record for `*` (an `AAAA` record to `100::` is the usual placeholder). Add the route `{ "pattern": "*.sliceos.app/*", "zone_name": "sliceos.app" }` to `platform/wrangler.jsonc`. The release token needs _Zone → Workers Routes → Edit_ for the zone, as it did for the launcher's own address.
5. **Set `MEMBER_APPS_ENABLED` to `"true"`** in `platform/wrangler.jsonc`. Steps 3 to 5 are one pull request.
6. **Check with a real account.** Connect an AI, create and publish an app, open it, share it with a second member, ask for Public, approve as the owner, take it offline, delete it. Then try the refusals: a member who is not on the app, a suspended member, and the app's address in a private window.

To switch off again, set `MEMBER_APPS_ENABLED` back to `"false"`: app addresses answer 404 and the tools disappear. Apps, versions and files are kept.

## What has not been verified

Everything above is tested against a local Worker, a local database and a browser with made-up people. Not checked against production: the wildcard address and its certificate, the file store at production size, and a real AI app completing a publish (a publish is a far larger tool call than any other; clients may have limits of their own). Publishing makes one store write per file; Cloudflare's per-request limits on the account's plan were not checked against a 50-file publish.
