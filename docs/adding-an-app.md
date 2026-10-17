# Adding an app

Slice apps inherit login, permissions and deployment from one platform. Add a module, not a new Worker or login system.

## Create and register

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm app:create alumni "Alumni directory"
pnpm dev
```

The command creates `platform/apps/alumni/server.tsx`, creates its `app.json` settings and README, and updates the generated catalog and server registry. The app is served at `/apps/alumni`; its optional API is `/api/apps/alumni/...`. All URLs stay on the platform origin and use the existing sign-in session. The catalog in this release is empty; creating this starter does not implement an alumni database.

Build the UI in the module's `Page` and any API in `api`. Import `AppModule` and context types from `../../src/platform/contracts`. Client components can be colocated; keep data reads and writes in guarded server handlers. The host owns routing and the page shell. Don't add server actions or unguarded Next route handlers for a module.

## Permissions

Registration automatically adds `app.alumni.open` to the existing permission editor. An active owner can open every registered app. Other members need an administrator to grant access through their level or individual permissions. Revocation takes precedence for nonowners. New sign-ins still follow the existing enrollment/approval flow.

Both page and API dispatch verify the Access token, load current membership from D1, and enforce the app capability before calling module code. Pending/suspended members are denied, including with an old valid session. Context exposes only the current member's ID/name/email and app-scoped permissions. App modules are trusted code in the same Worker, not a sandbox: server code could still import platform internals and read the membership database directly, and no automated check currently stops that. Use only the context and your app's own storage, and reviewers should reject any app that reaches into membership or platform internals. API responses are sent as `private, no-store`, and any `Set-Cookie` or `Clear-Site-Data` header an app sets is removed, because apps share the platform's origin and sign-in cookie.

Declare additional actions in that app's `app.json`:

```json
{
  "id": "alumni",
  "name": "Alumni directory",
  "description": "Approved alumni records",
  "permissions": [{ "id": "records.edit", "label": "Edit alumni records" }]
}
```

Keep `app.json` as an ordinary file of at most 64 KiB; symbolic links are rejected. Run `pnpm apps:sync` after app settings changes. In a write handler, call `context.requirePermission("records.edit")` before changing records. This checks the full permission `app.alumni.records.edit`. Unknown or ungranted actions fail closed. Each app must also validate business inputs and enforce resource ownership; the platform cannot infer those rules.

## API contract

`api` receives `{ context, path, searchParams, method, input }` and returns a `Response`. GET and HEAD have no input. POST, PUT, PATCH and DELETE require same-origin `application/json`, limited to 16 KiB; parsed input remains `unknown` until the app validates its schema. `path` is the decoded suffix after the app ID. Use safe identifiers and parameterized queries rather than treating paths as filesystem locations. API output is always private/no-store. Use the shared `MembershipError` for expected HTTP errors; unexpected errors return a generic response.

Do not mutate on GET/HEAD. Large uploads, webhooks and other special transports need a separately reviewed platform extension. Public metadata and client assets must contain no private records or secrets.

## MCP tools

Add optional `tools` to the same server module using `defineAppTool`. Each tool declares its schema and an action from the app catalog; the platform owns `/mcp` and verifies the consultant's current membership, app access and action before dispatch. Use the same business functions and record-level authorization as the app's API. Follow the [MCP recipe and constraints](mcp.md); app modules do not import the MCP SDK or create their own server/authentication flow.

## Validation and release

Add meaningful `*.test.ts` tests beside module code; the host's suite discovers them. Run:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm smoke:launcher
```

`check:platform` rejects stale registries, unknown modules, duplicate IDs/permissions, per-module deployment files, and server actions bypassing the platform API. The architecture checker blocks client imports of server entry points. CI still requires app-specific tests and reviewer judgment; these checks are not a sandbox.

Open a PR. Once approved and merged, the existing pipeline builds one artifact containing all apps, validates it, and deploys it using the platform's production environment. All modules share release and rollback. No app-specific cloud credentials or deployment workflow is needed. Schema changes and private storage remain explicitly reviewed platform resources.
