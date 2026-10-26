# Alumni directory starter

A read-only learning app with three invented alumni and two invented students. The directory runs inside the Slice platform and in an isolated contributor preview. It does not yet implement persistent alumni storage, editing, matching, alumni MCP tools or refresh jobs.

Start with the [team guide](../../../docs/team/README.md), [shared contracts](../../../docs/team/contracts.md) and your assigned task. Do not scaffold another alumni app.

## Ownership

- `contracts.ts`, `fixtures.ts`, `data.ts`, `server.tsx`, `app.json`: shared integration baseline, coordinated by Ivan.
- `data/`: import/storage contributor; the initial read-only adapter remains in `data.ts`.
- `ui/`: directory/student interface contributor.
- `matching/`: matching contributor; create in the first task.
- `mcp/`: MCP contributor; create in the first task.
- `refresh/`: refresh contributor; create in the first task.

Only create files needed for your task. App code uses the platform's login, permission enforcement, MCP transport and deployment. No independent app server, production credential or cron configuration belongs here.

## Preview and checks

From the repository root:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm team:dev
```

The default preview is loopback port 4310; prepared person workspaces use 4311–4315. Remote contributors need their own approved SSH access and forwarding; see [workspaces](../../../docs/team/workspaces.md). The preview is fictional and local-only, not a production login bypass.

```sh
corepack pnpm --filter @slice/launcher exec vitest run apps/alumni
corepack pnpm --filter @slice/launcher exec playwright install chromium
corepack pnpm test:team
```

Before a PR run all [contributor checks](../../../CONTRIBUTING.md#4-implement-and-check). The app lives at `/apps/alumni` in the real platform. Active members need `app.alumni.open` and `app.alumni.records.read`; owners inherit these permissions. Real platform access is not granted by launching a local preview.

## Data and operations

`GET /api/apps/alumni/records` loads validated fixture copies; writes are rejected. The page and API require `records.read`. All examples are synthetic and safe for this public repository. Do not replace fixture files with real data. Persistent storage, field visibility, record ownership and import/update permissions require agreed requirements and reviewed integration before real data is introduced.
