# App access: each app is Public or Private, run by its own managers

Status: **approved by Ivan on November 18, 2026.** This is the design the implementation follows. Decisions marked _(Ivan)_ are his, from the design conversation. Decisions marked _(proposed)_ were made while writing this; he approved them with the design.

## Why

On November 17, 2026 an active member could not open the alumni directory. Nothing was broken. An app opens only for people holding its permissions, and those are handed out in **Organization → Access levels** or on a member's record. Production had neither: both levels carried organization permissions only and no member had an individual permission, so the owner was the only person who could open the app. The tile was still shown to everyone.

The control is in the wrong place. Someone deciding who may use an app looks at the app, not at a list of access levels. And every change needs the owner or a membership administrator, so the person who built an app cannot share it.

This is the first of three stages toward letting non-technical members build, run and share their own apps:

1. **This design.** Access is set on the app, by the people who run it.
2. Later: member-built apps run in their own sandbox with their own database and are published through the launcher. Creating an app there records its builder as its first manager.
3. Later: a starter kit and instructions for a builder's AI, with preview and roll back.

Stages 2 and 3 are out of scope here and get their own designs.

## What changes for people

- **A member** sees only the apps they can open. A private app they have not been given is not on their launcher.
- **An app's manager** opens the app's page from its tile, switches the app between Public and Private, adds and removes people, hands out the app's extra powers and names other managers.
- **The owner** can do all of that for every app, and names each app's first manager.
- **A membership administrator** no longer sees app permissions in access levels or on a member's record. Levels keep the four organization permissions.

## Decisions

### Who can open an app

- **Public or Private.** _(Ivan)_ Every app is one or the other. Public is open to every active member. Private is open only to the people added to it by name.
- **Active members only.** _(proposed)_ "Everyone" means every member whose status is Active. Pending, invited and suspended people open nothing, as today. An invited person added to a private app gets it when they sign in and become active.
- **A new app starts Private with nobody added.** _(proposed)_ An app with no saved settings is Private with no managers and no people, so only owners can open it. This is exactly today's behavior for the alumni directory, so releasing this design changes nothing until someone edits an app's settings.
- **No per-person block inside a public app.** _(proposed)_ Today an individual Revoke can keep one person out of an app. That goes away. To keep someone out of an app, make it Private; to keep them out of Slice, suspend them.

### What a person can do inside an app

An app can declare several permissions. The alumni directory has three: ordinary use (`records.read`), `admin` and `refresh.run`. One switch cannot hand out all three, so permissions fall into two kinds. _(proposed)_

- **Comes with access.** Everyone who can open the app holds these. An app marks them in `app.json` with `"withAccess": true`. For the alumni directory that is `records.read`.
- **Extra powers.** Everything else. A manager gives these to named people, one tick box per power, using the label already written in `app.json`. For the alumni directory these are `admin` and `refresh.run`.

A person can hold an extra power in a public app; they are listed on the app for that reason.

### Who runs an app

- **Managers.** _(Ivan: the person who built or started the app can edit its settings.)_ Each app has zero or more managers. A manager can change Public/Private, add and remove people, set people's extra powers, and add and remove managers, including themselves. A manager has no say over any other app, over membership or over access levels.
- **Managers hold all of their app's permissions.** _(proposed)_ They could grant themselves any of them, so listing them separately would add steps without adding safety.
- **The owner assigns the first manager.** _(proposed)_ The launcher cannot tell who built an app that arrives through the code repository: the builder is known there by a GitHub account, which is not linked to their membership. So the owner names the builder as manager on the app's page. Stage 2 removes this step for member-built apps.
- **Owners can always manage every app.** _(proposed)_ An app with no manager, or whose manager has left, is never stranded.
- **Membership administrators do not manage apps.** _(proposed)_ Holding `members.manage` or `levels.manage` gives no say over an app. Only owners and that app's managers do.
- **App access does not outrank a membership administrator.** _(proposed)_ Today an administrator cannot change a member whose access exceeds their own. That comparison counts organization permissions only. Otherwise an administrator could not suspend someone merely because that person runs, or was added to, an app the administrator is not in.
- **Who can be added.** _(proposed)_ People and managers must be members of Slice. Their place on an app takes effect only while they are Active.

### One place to set app access

_(proposed)_ App access is set only on the app's page.

- Access levels and a member's individual Allow and Revoke stop offering app permissions and keep only `members.read`, `members.manage`, `levels.manage` and `audit.read`.
- An app permission still stored on a level or member is ignored when access is worked out, and a save that includes one is refused.
- Production held none on November 17, 2026 (two levels with organization permissions only; every member's Allow and Revoke empty). Confirm that again before release. If any have appeared, list them for the owner, who re-creates them on the app's page; do not convert them automatically.

### The tile and the app page

- **One button instead of Guide.** _(Ivan)_ The tile's second button opens a single page for the app that holds both its information and its settings. _(proposed)_ The button is labelled **Details**.
- **The page.** _(proposed)_ At `/about/<id>`; `/guides/<id>` redirects there. Everyone who can open the app sees its name, description, work-in-progress label, whether it is Public or Private, who runs it, an **Open** button and the guide.
- **The manage section.** Shown only to the app's managers and to owners, below the guide:
  - **Who can open it:** Public or Private, with one line saying what each means.
  - **People:** who has been added, each with tick boxes for the app's extra powers, plus add and remove.
  - **Managers:** who runs the app, plus add and remove.
  - Saving a switch to Public asks for confirmation and states the number of active members and invited people it opens the app to.
- **Private apps are hidden from people without access.** _(proposed)_ No tile on their launcher. If they follow a link to the app or its page, they get a plain message that the app is private and the names of the people who run it (or "the Slice owner" when it has no manager). An unknown app ID is still "not found", and a signed-out visitor is sent to sign in first. This hides clutter, not secrets: app names, descriptions and guides are in the public repository.
- **Empty launcher.** A member with no apps sees "No apps have been shared with you yet."
- **Picking people.** _(proposed)_ The picker offers the member list that person can already see. An ordinary manager picks from active members by name and title. Someone who can already see the full member list (an owner or membership administrator) can also add invited people. No manager sees an email address they could not see before. Someone already on the app whom the manager cannot see in the member list (an invited person the owner added) is shown as "Invited member" and can be removed but not identified.

### Records and limits

- Every change to an app's settings is recorded in **Activity** with who made it and the settings before and after, like membership changes today.
- Changes count against the existing limit of 30 membership changes a minute per person.
- Settings use the same "someone else saved first, reload" protection as membership changes.
- Removing a member from Slice also removes them from every app's people and managers.

## How it fits the code

Follow the membership code's existing shape; it already solves stale saves, audit history and per-request reloads.

- **Storage.** One new table in the membership database, one row per app with settings, holding a JSON document like members and levels do: `{ id, visibility: "private" | "public", managers: [memberId], people: [{ memberId, powers: [permissionId] }] }`. It is loaded into `State` and saved through `Repository.commit` under the same revision guard. A row for an app no longer in the catalog is ignored. Use the next free migration number at merge time (main is at `0008`; `0009` is taken on an open branch).
- **Working out access.** `effectivePermissions` in `platform/src/membership/domain.ts` stays the single answer, so pages, app APIs and AI tools all follow it without their own changes:
  - not active: nothing;
  - owner: everything, as today;
  - organization permissions: level plus Allow minus Revoke, as today, organization permissions only;
  - for each app: a manager gets all of its permissions; otherwise a person with access (the app is Public, or they are in its people) gets `app.<id>.open`, its `withAccess` permissions and their listed powers; anyone else gets none.
- **Saving.** One new command, `app.update`, carrying the whole settings document, through the existing `/api/membership` envelope with its revision check. Refuse it unless the actor is an owner or a current manager of that app. Validate that every member ID exists, every power is one of that app's extra powers, and the app is in the catalog.
- **Reading.** The membership view gains, per app the person can open or manage: whether they can open it, whether they can manage it, Public or Private and the managers' names. It carries the full settings only for apps they can manage. The launcher and the app page render from that.
- **`app.json`.** Permissions gain the optional `"withAccess": true`. `scripts/platform-apps.mjs` validates it (only `true`, or left out), and `pnpm app:create` writes a starter whose basic permission has it.
- **Test fixtures.** `platform/apps/alumni/tests/members.ts` and `scripts/signed-in-smoke.test.mjs` give synthetic members app permissions through levels. Move them to app settings, and check that the team preview's learner can still open the alumni directory.
- **AI connections.** No change to `/mcp`. Tools follow `effectivePermissions`, and membership is reloaded on every call, so someone removed from an app loses its tools on their next request.

Left to the builder: table and column names, how the page splits server and browser rendering, component structure, and the confirmation wording.

## Goals

- The person who runs an app can open it to everyone or to named people without help from the owner.
- A member never sees a tile that leads to a refusal.
- There is one place to look to answer "who can use this app, and who decided?"

## Non-goals

- Sandboxed member-built apps, registering an app through the launcher, and the builder starter kit (stages 2 and 3).
- **A check that blocks a pull request until an app is registered.** Ivan asked for agents to be unable to ship app code without first registering it through the launcher. _(proposed)_ That moves to stage 2, where creating the app through the launcher is the registration and cannot be skipped. Apps that arrive through this repository are reviewed by Ivan before merge and start owner-only, so a second gate adds little here.
- Giving access to a whole access level or group at once. Private means named people. If adding people one by one becomes a chore, add "everyone on this level" as a later change.
- A "request access" button, invitation emails, and apps open to people who are not members.

## What would make this a failure

- An app opens to someone because of a default, a leftover level permission or a release, rather than because a manager or owner chose it.
- Access can be set in two places that disagree.
- A manager can change another app, membership, or their own standing in Slice.
- A manager learns member email addresses they could not already see.
- Someone who lost access keeps it through an old browser session or a connected AI app.

## Testing

Per `AGENTS.md`: behavior and denial paths, synthetic people only.

- **Access table:** Public and Private, crossed with listed, unlisted, manager and owner, crossed with active, pending, invited and suspended. Include "comes with access" against extra powers.
- **Leftovers:** an app permission on a level or in Allow grants nothing; a level save containing one is refused.
- **Saving:** a non-manager, a manager of a different app and a membership administrator are each refused; unknown member, unknown power and unknown app are refused; a stale save is refused; each change writes one Activity entry.
- **Loss of access:** removing a person, and switching Public to Private, stops both their next page request and their next AI tool call.
- **Removal:** removing a member clears them from every app.
- **Browser:** a member sees only their apps; a manager sees the manage section and a member does not; switching to Public asks for confirmation; desktop and mobile, with the accessibility scan.

## Release

- The migration only adds a table. Releasing changes nobody's access: the alumni directory stays owner-only until its settings are edited.
- After release, Ivan opens the alumni directory's page and chooses. Making it Public opens alumni contact details to every active member and to each invited person as they sign in; adding named people does not.
- Rolling back the code returns access to the old level rules, under which nobody but owners has app access, so a rollback closes apps rather than opening them. The settings table is left in place.
- Update `docs/membership.md`, `docs/adding-an-app.md`, `docs/design-profile.md` (the Guide button), the alumni app's README (how `admin` and `refresh.run` are granted) and the `pnpm app:create` starter.
