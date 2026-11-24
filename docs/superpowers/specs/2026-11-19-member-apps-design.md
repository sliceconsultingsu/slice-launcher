# Member apps: members build, publish and run their own apps through the launcher

Status: **Ivan said to build every stage on November 19, 2026 ("do all stages sequentially"). He has not commented on the individual choices.** Ivan set the goal and three points, marked _(Ivan)_. Every other choice here is a recommendation made at his instruction ("do the rest with your recommended choice") and is marked _(proposed)_. Nothing in this document has been checked against a live Cloudflare account; facts taken from Cloudflare's documentation are marked _(documented)_.

This is stage 2 of three. Stage 1, [app access](2026-11-18-app-access-design.md), shipped on November 19, 2026. Stage 3 (a starter kit for the builder's AI, with preview and roll back) gets its own design.

## Why

Ivan's goal: non-technical members make, manage and share apps with as few restrictions as possible, with deployment hidden so they can concentrate on solving a problem. _(Ivan)_

Today that is not possible, and the reason is how apps are hosted, not policy. Every app is bundled into the one launcher program and shares its database. `docs/adding-an-app.md` says an app's server code "could still import platform internals and read the membership database directly, and no automated check currently stops that." Ivan's review of every pull request is the only safeguard, so a builder needs GitHub, branches, a workspace and his approval for every change.

Remove the reason and the restrictions can go. If each member-built app runs in its own sandbox with its own database, the worst a broken or careless app can do is damage its own data.

## What a builder does

1. Connects their AI to Slice, as members can today (**Connect your AI**).
2. Tells it what they want. The AI calls a launcher tool to **create the app**. That records the signed-in member as the app's first manager. _(Ivan: an app must be registered through the launcher, with its owner recorded, before any of its code can ship.)_
3. The AI writes the app and calls a tool to **publish** it. It is live at `https://<id>.sliceos.app` within seconds, private to the builder.
4. The builder opens the app's page in the launcher and shares it: named people at once, or everyone after the owner's one-time OK.

No Git, pull request, build tool or Cloudflare account is involved.

## Decisions

### Where apps run

- **A sandbox per app.** _(proposed)_ Member apps run on Cloudflare Workers for Platforms: each app is its own Worker in a dispatch namespace. Each can reach only what is attached to it _(documented)_, and the launcher attaches exactly one thing: that app's own database.
- **The launcher stays in front.** _(proposed)_ The launcher's own Worker is the dispatcher. A member app is reachable only through it _(documented)_, so sign-in, membership and app access are checked before the app's code runs, on every request, as they are for built-in apps today.
- **An address per app.** _(proposed)_ The launcher moves to `https://sliceos.app`. _(Ivan: the domain.)_ Each member app is at `https://<id>.sliceos.app`, served by one wildcard route to the dispatcher _(documented)_. Separate addresses matter: if a member's app shared the launcher's address, a page in it could make requests as whoever was viewing it, including the owner.
- **Built-in apps stay as they are.** _(proposed)_ Apps in this repository (the alumni directory) keep running inside the launcher, reviewed by Ivan. Both kinds appear in the same launcher grid and use the same app page and settings.

### What an app is

_(proposed)_ The smallest thing an AI can write without a build step:

- One Worker module in plain JavaScript, plus static files (HTML, CSS, images, browser JavaScript). No package installation and no bundler.
- A name, a one-line description, and a guide in Markdown for the app's page.
- Optionally, extra powers (an ID and a label each) that its managers tick for named people, as in stage 1.

What it is given on each request, by the dispatcher:

- The signed-in member's ID and name, whether they manage the app, and which extra powers they hold. These arrive as request headers the dispatcher sets after removing any the browser sent, so an app can trust them.
- Its own database, as the binding `DB`. The app creates and changes its own tables.

What it is not given: the member's email address, the launcher's session cookie, the membership database, another app's database, or any Slice secret.

### How free publishing is

- **Live at once to named people.** _(proposed; Ivan accepted this as the recommended choice)_ A new member app is private. Its managers can add people by name and those people can use it immediately. Publishing a new version replaces the live one immediately.
- **The owner's one-time OK to go Public.** _(proposed)_ A manager can ask for an app to be Public; it becomes public when an owner approves on the app's page. Later versions do not need another OK, so an approved app could change afterwards; every version is kept and an owner can unpublish it at once. The reason: a public app is shown to every member under Slice's name, and one that imitates a sign-in page could collect passwords.
- **No reaching beyond itself, for now.** _(proposed)_ In this stage an app cannot call outside services, hold secrets (so no AI model calls), read Slice's own data (members, alumni), run on a schedule, or offer its own AI tools. Outside calls are blocked for every member app by an outbound Worker _(documented)_, not left to the app's good behavior. Each of those is a later addition behind the same one-time OK. This is the largest restriction in the design; see "What this costs builders".
- **Limits.** _(proposed)_ Five apps per member; one megabyte of Worker code and five megabytes of static files per app; Cloudflare's per-request processing limit set low for member apps. Owners are not limited. The numbers are starting points.

### Sign-in across addresses

_(proposed)_ The launcher's session cookie is bound to the launcher's own address and is never sent to an app's address. So:

1. A person opens `https://notes.sliceos.app`. The dispatcher finds no session for that address and sends them to the launcher.
2. The launcher checks they are signed in, active and allowed to open that app, then sends them back with a one-time pass that expires in a minute.
3. The dispatcher exchanges the pass for a session cookie bound to that one app's address. The app's own code never sees it: the dispatcher removes cookies before calling the app and removes any cookie the app tries to set.

Membership and app access are still reloaded on every request, so suspending someone or taking them off an app applies at once.

Because app addresses are under `sliceos.app`, an app's page can send requests to the launcher. Three existing rules keep that harmless and must not be weakened:

- the launcher accepts a change only when the request comes from the launcher's own address;
- nothing changes on a plain page load (GET);
- the launcher's session cookie has the `__Host-` prefix, which an app's page cannot set or overwrite.

A second domain for member apps would remove this class of risk entirely. It is not required to start, and moving apps to one later changes only their addresses.

### Managing and stopping apps

- **Stage 1 settings apply unchanged.** Public or Private, people, extra powers and managers are set on the app's page. Member apps differ only in needing the owner's OK to go Public.
- **Every published version is kept.** _(proposed)_ Its files, who published it and when, so the owner can see what ran and so stage 3 can add roll back.
- **Owners can stop any app.** _(proposed)_ Unpublish takes it offline at once and keeps its data. Delete removes the app and, after 30 days, its database.
- **Apps outlive their builders.** _(proposed)_ An app and its data belong to Slice. When a builder leaves, an owner names a new manager.
- **Everything is recorded.** Creating, publishing, sharing, approving, unpublishing and deleting each add an **Activity** entry.

### The tools a builder's AI gets

_(proposed)_ Four launcher tools, available to any active member's connected AI:

| Tool                | Does                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| `slice_app_create`  | Reserves an ID and records the caller as manager. Refuses reserved and taken IDs. |
| `slice_app_publish` | Uploads the Worker module, static files and guide, and makes that version live.   |
| `slice_app_status`  | Says whether the app is live, its address, its last publish and recent errors.    |
| `slice_app_list`    | Lists the apps the caller manages.                                                |

Sharing stays with the person, on the app's page; an AI cannot change who has access. Each tool rechecks that the caller is an active member and manages the app.

## What this costs builders

Be plain about it: a stage 2 app is a private database with screens. That covers trackers, sign-up sheets, directories, checklists, simple calculators and forms. It does not cover anything that calls an AI model, sends email, reads a spreadsheet from elsewhere or uses Slice's member list. Those need outside calls, secrets or Slice data, which this stage leaves out so that the sandbox boundary can be proven first. If the first real app a member wants needs one of them, that addition moves ahead of everything else in stage 3.

## What only Ivan can do

None of this can be done by a contributor or an AI:

1. **Buy Workers for Platforms** on the Cloudflare account: $25 a month, including 20 million requests and 1,000 apps _(documented)_. Confirm the account's database allowance covers one database per app.
2. **Put `sliceos.app` on that Cloudflare account**, if it is not already.
3. **Create a Cloudflare API token** limited to uploading Workers in the dispatch namespace and creating databases, and store it as a launcher secret. The name goes in Git; the value never does.
4. **Add `https://sliceos.app/api/auth/google/callback`** to the Google sign-in client.
5. **Choose the day the launcher moves.** Everyone signs in again and reconnects their AI app once, because both are tied to the address.

## Order of work

Two releases, each useful alone:

1. **Move the launcher to `sliceos.app`.** The old address redirects. No new features.
2. **Member apps.** The registry, the dispatcher, cross-address sign-in, the four tools and the owner's approval.

## Goals

- A member with no technical background can go from an idea to a working app shared with teammates in one sitting, using only their AI and the launcher.
- A member app cannot read or change anything outside its own database, whatever its code does.
- Ivan does not review code for an app to exist.

## Non-goals

- Outside calls, secrets, Slice data, schedules and app-provided AI tools (later, behind the owner's OK).
- Preview, roll back and the builder starter kit (stage 3).
- Apps for people who are not members, and custom domains.
- Package installation or a build step.
- Moving the alumni directory into a sandbox.

## What would make this a failure

- A member app reads the launcher's session, the membership database, another app's data or a member's email address.
- An app's code runs for someone before the launcher has checked they may open it.
- A person taken off an app, or suspended, can still use it.
- An app goes Public without an owner having approved it.
- A builder needs Git, a terminal or Cloudflare to publish.
- An app is stranded, or its data lost, because its builder left.

## Decisions made while planning (November 19, 2026)

Made by the builder after reading the launcher's code and Cloudflare's documentation. Each is a recommendation, like the rest of this document. Where one differs from the text above, this section wins.

- **Stage 2 ships as three releases, not two.** (1) The launcher's address, as two pull requests: add `sliceos.app`, then move. (2a) Member apps made of screens only: the registry, addresses, sign-in across addresses, the four tools and the owner's OK. This needs no purchase. (2b) Server code and a private database per app. Only this needs Workers for Platforms.
- **The launcher serves an app's screens itself.** A published version's files are kept in a store the launcher owns (a Cloudflare KV namespace) and the launcher answers every request for a page, script, style or image. The app's own Worker, when it has one, answers only addresses under `/api/`. The launcher therefore sets the browser rules on every page, no file upload goes through Cloudflare's assets API, and an app with no server code needs no sandbox at all.
- **What an app's browser pages may do.** Pages may load, call and post only to their own address. That is enforced by a browser content policy the launcher sets, alongside the outbound block on server code. It is not airtight: a page can still send its viewer to another site, so a dishonest app could leak what it can itself see, which is its own data and the viewer's name. It can never see an email address, the launcher's session or another app's data. This is why going Public needs the owner's OK and every version is kept.
- **Publishing through an AI tool call is limited to 1 MB and 50 files.** That is what a tool call can reasonably carry. A separate upload address for larger apps, for an AI that can run commands, moves to stage 3 with the starter kit. The 5 MB figure above applies then.
- **Asking for Public is saving Public.** When a manager who is not an owner saves a member app as Public before it has been approved, the rest of the save applies, the app stays Private, and the app's page shows that the owner has been asked. When an owner saves it as Public, that is the approval. After approval its managers can switch it either way.
- **Sign-in at an app's address depends on the launcher's.** An app's session is tied to the launcher session it came from. Signing out of the launcher, being suspended or being removed ends it at once, without a second list to clear.
- **Member apps stay off until configured.** The code can be released with member apps switched off. Turning them on is a separate configuration change (the store, the wildcard address and one setting), so a release never depends on a Cloudflare resource that does not exist yet.
- **An app's ID is never reused.** A deleted app keeps its ID reserved, so an old link can never open someone else's app.
- **Unpublish and roll back are one action.** The registry records which version is live; "none" is unpublished. Stage 3's roll back sets it to an earlier version.

## What the builder of this must settle first

These are unknowns, not decisions, and the plan should start by answering them:

- Whether the local test runtime can run a dispatch namespace, or whether the dispatcher needs a stand-in for tests.
- How a published version's files are stored (the choice affects cost and the size limits above).
- How large a publish can be when it arrives through an AI tool call, and whether a separate upload address is needed for an AI that can run commands.
- How the AI connection (`/mcp` and its sign-in) behaves across the move to the new address.

## Testing

Beyond behavior and denial paths as in `AGENTS.md`, this stage needs tests written as an attacker would write an app. A member app that tries each of these must fail: read the launcher's cookie; send its own identity headers; set a cookie for `sliceos.app`; post a change to the launcher from its page; reach another app's database; call an outside address; keep working for a suspended member.
