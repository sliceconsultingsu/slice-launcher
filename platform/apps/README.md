# Build your app here

Each Slice tool belongs in its own folder under **`platform/apps/`**. The alumni directory learning starter is already here; the [team guide](../../docs/team/README.md) explains how to work on it. To start a different app, run from the repository root:

```sh
pnpm app:create my-tool "My tool"
```

You will get:

```text
platform/apps/my-tool/
  README.md     What this app does, its access rules, icon credit and how to test it
  app.json      Public name, description, action permissions and optional workInProgress
  icon.svg      Launcher icon (replace the grey starter; icon.png also works)
  guide.md      Consultant guide behind the launcher's Guide button
  server.tsx    Starter screen; optional API and MCP tool handlers
```

Add app-specific UI, business logic and tests in this same folder. The platform discovers `app.json` files and generates its catalog, import registry, published icons and guides with `pnpm apps:sync`. Apps appear at `/apps/<id>` and inherit login, permissions, MCP and one deployment.

Follow [adding an app](../../docs/adding-an-app.md), the [design profile](../../docs/design-profile.md) and [contributing](../../CONTRIBUTING.md). The singular [platform/app/](../app/) folder contains shared routing, not the place to start a business app. The shared platform implementation is in [platform/src/](../src/).
