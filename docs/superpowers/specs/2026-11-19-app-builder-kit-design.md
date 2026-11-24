# The builder's kit: a guide for the member's AI, preview, and larger apps

Status: **built on November 19, 2026 at Ivan's instruction to build every stage ("do all stages sequentially"). He set the goal; every choice here is a recommendation he has not yet read.**

This is stage 3 of three. Stage 1 is [app access](2026-11-18-app-access-design.md). Stage 2 is [member apps](2026-11-19-member-apps-design.md), which this builds on.

## Why

Stage 2 lets a member's AI create and publish an app. Three things still stand between a non-technical member and a good app:

- **The AI starts cold.** It knows the rules from the tools' descriptions, but not how to work with someone who has never built anything: what to ask, how small to start, what to tell them about sharing.
- **Publishing is all or nothing.** Every publish replaces what people are using, so there is no way to look before others do.
- **A tool call is a small pipe.** An app has to be typed out inside one call, which limits it to 1 MB and makes an AI that could simply send files from a folder do it the hard way.

## Decisions

All _(proposed)_.

### A guide the AI asks for

- **One more tool, `slice_app_guide`.** It returns the builder's guide and a starter app. The other tools' descriptions tell the AI to read it first. It needs no input and changes nothing.
- **What the guide says.** How to work with the member: ask what problem they have, who will use the app and whether anything must be saved or shared; say plainly what an app cannot do; start with the smallest thing that helps; publish as a preview and have the member try it; then publish for real and explain how to share it from the app's page. It also carries the technical contract in one place, and a recipe for sending files from a folder.
- **A starter app.** A few small files that already work: a first screen in Slice's look, a script that greets the member by name, and, when server code is on, a `worker.js` that keeps a list in the app's database with the checks in the right place. An AI adapts these instead of inventing a structure.
- **One sentence for the member.** The **Connect your AI** page gets a "Make an app" card with a message to paste into their AI. It is shown only while member apps are on.

### Preview

- **A preview is a version only the people who run the app see.** Publishing with `preview` stores the version and leaves what everyone else sees untouched. The people who run the app get the preview at the app's address; everyone else gets the live version, or nothing if there is none yet. A first publish as a preview is therefore a private draft.
- **Making it live is a person's step, or a second publish.** The app's page shows the preview with **Make it live** and **Discard preview**. Publishing again without `preview` also replaces it.
- **One preview at a time.** A new preview replaces the last. A live publish clears it.
- **A preview's server code uses the app's real database.** There is one database per app. The guide tells the AI to keep changes to tables compatible, and the app's page says so.

### Larger apps

- **A one-time upload address.** `slice_app_upload` gives an AI that can run commands an address to send the app's files to in one request. It works once, for ten minutes, for that app and that member, and takes the same content as `slice_app_publish`.
- **Limits through the address:** 100 files, 2 MB each, 5 MB in all. Through a tool call they stay at 50 files and 1 MB.
- **The address is the credential.** It carries no cookie, so it can be used from a terminal. Membership and who runs the app are still checked when it is used, and it counts against the same publishing pace.

## What this adds to the risks

- An upload address is a secret in a URL for ten minutes. It can only publish a version of one app its holder already runs, and it is used up on first use.
- A preview's server code runs against live data. A careless preview can damage the app's own data, as a careless publish can.
- The guide is advice. An AI can ignore it; the launcher's rules do not depend on it.

## Not in this stage

- Recent errors from an app's server code in `slice_app_status`.
- Clean-up of a deleted app's Workers and database.
- Secrets, outside calls, Slice's own data, schedules and app-provided AI tools, each behind the owner's OK.
- A database copy for previews.

## What would make this a failure

- A preview is visible to someone who does not run the app.
- An upload address publishes to a different app, works twice, or works after its member is suspended.
- The guide tells an AI something the launcher does not actually do.
