# Build your app here

Each Slice tool belongs in its own folder under **`platform/apps/`**. There are currently no implemented business apps. The alumni directory is a planned first app.

From the repository root, run:

```sh
pnpm app:create alumni "Alumni directory"
```

You will get:

```text
platform/apps/alumni/
  README.md     What this app does, its access rules and how to test it
  app.json      Public name, description and action permissions
  server.tsx    Starter screen; optional API and MCP tool handlers
```

Add app-specific UI, business logic and tests in this same folder. The platform discovers `app.json` files and generates its catalog/import registry with `pnpm apps:sync`. Apps appear at `/apps/<id>` and inherit login, permissions, MCP and one deployment.

Follow [adding an app](../../docs/adding-an-app.md) and [contributing](../../CONTRIBUTING.md). The singular [platform/app/](../app/) folder contains shared routing, not the place to start a business app. The shared platform implementation is in [platform/src/](../src/).
