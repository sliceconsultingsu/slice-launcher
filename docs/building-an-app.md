# Making an app

**A new app on Slice is a member app.** You make it with your own AI, it gets its own address under `sliceos.app`, and it never enters this repository. The maintainer decided this on November 24, 2026. Before then, every app was a folder in this repository, added by pull request.

This page says which kind of app to make and where the work happens. [Member apps](member-apps.md) describes how they work and what keeps them safe.

## The two kinds

|                      | Member app                                                                          | Built-in app                                                                   |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Use it for           | Every new app                                                                       | Only an app the maintainer has agreed must be built in                         |
| Who makes it         | Any active member, with their AI                                                    | A contributor to this repository                                               |
| Where its files live | With the person who made it. The launcher keeps every published version             | `platform/apps/<id>/` in this repository                                       |
| How it goes live     | The AI publishes it through the launcher's tools. It is live at once                | A pull request, the maintainer's review and a release of the whole launcher    |
| Who can open it      | Its maker, until they share it. Showing it to every member needs an owner's OK once | Owners, until its managers open it to people                                   |
| Address              | `https://<id>.sliceos.app`                                                          | `https://sliceos.app/apps/<id>`                                                |
| What it can reach    | Only itself: its own files, and its own database once server code is switched on    | The launcher's own runtime and database, which is why every change is reviewed |

## Make a member app

1. **Connect your AI to Slice.** Follow [Connect your AI](connect-your-ai.md).
2. **Ask it for an app.** It reads the builder's guide (`slice_app_guide`), asks what you are trying to solve, reserves the app's ID (`slice_app_create`) and publishes a preview that only you can see (`slice_app_publish`).
3. **Open the preview and ask for changes.** When it is right, have your AI publish it for real.
4. **Share it** from **Details** on its tile in the launcher.

No Git, pull request, build tool or Cloudflare account is involved, and you do not need a copy of this repository. Keep the app's files in a folder of your own.

## What a member app cannot do yet

Member apps were switched on for apps made of screens on November 24, 2026. A member app today cannot:

- **Save anything between visits, or share data between the people using it.** This needs server code and a database for each app. That part is built and switched off: it needs a paid Cloudflare product and a check on the real account. See [server code and a database](member-apps.md#server-code-and-a-database).
- **Call an outside service or load anything from another site.** It holds no secrets, so it cannot call an AI model.
- **Read Slice's own data,** such as members or alumni.
- **Send email or run on a schedule.**
- **Offer tools to a member's AI.**

Only the first of these is built. The size limits, and what has not yet been checked in production, are in [member apps](member-apps.md#what-an-app-can-be).

If your app needs one of these, do not build it in this repository as a way round the limit.

- **Make the part that fits now.** A reference page, a calculator, a checklist, or a template with a prompt to copy all work as screens.
- **Ask the maintainer.** They decide whether the app waits for the missing part or becomes a built-in app.

## Built-in apps

An app is built into the launcher only when the maintainer has agreed to it before the work starts. The pull request says what the app needs that a member app cannot do, and links to that agreement. Then follow [adding a built-in app](adding-an-app.md).

The alumni directory is the only built-in app. It keeps shared records and offers tools to members' AI, and a member app can do neither yet. The maintainer intends to move it to a member app, and decided on November 26, 2026 that it keeps its AI tools when it moves. So the move waits on two things: server code being switched on and checked, and member apps being able to offer tools, which is not built. No date is set. Until then, work on it continues here through the [team guide](team/README.md).

## If you are an AI agent

When the person you are working with asks for a new app, tool, tracker, calculator or page for Slice:

1. **Do not create it in this repository.** Do not run `pnpm app:create`, add a folder under `platform/apps/` or open a pull request here for it.
2. **Tell them it will be a member app,** and what that means for them: its own address, live as soon as it is published, and private until they share it.
3. **Check that you are connected to Slice.** You should have tools named `slice_app_*`. If you do not, follow [Connect your AI](connect-your-ai.md). If your AI app cannot make the connection, say so and stop. Do not fall back to a built-in app.
4. **Call `slice_app_guide` and follow it.** It carries the current limits, taken from the launcher's code. Where it differs from this page, the guide is right.
5. **Say what the app will not be able to do** before you build, using the list above. If the request depends on something in that list, stop and have the person ask the maintainer.
6. **Work in a folder outside this repository.** This repository is public. A member app's files, and any real data, do not belong in it.

You do not need a checkout of this repository to make a member app.
