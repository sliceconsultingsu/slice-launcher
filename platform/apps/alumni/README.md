# Alumni directory starter

A read-only learning app with three invented alumni and two invented students. The directory runs inside the Slice platform and in an isolated contributor preview. It does not yet implement persistent alumni storage, editing, matching, alumni MCP tools or refresh jobs.

Start with the [team guide](../../../docs/team/README.md), [shared contracts](#common-interfaces) and your assigned task. Do not scaffold another alumni app.

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

## Common interfaces

These are the development baseline for parallel work, not final client-approved requirements. Propose shared changes to Ivan before implementing them in multiple branches.

The source of truth is [`contracts.ts`](contracts.ts). All example people and companies in [`fixtures.ts`](fixtures.ts) are invented. Do not add real records to this public repository.

| Record           | Fields                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Alumni           | `id`, `name`, `graduationYear`, `company`, `role`, `industry`, `expertise[]`, `lastVerifiedAt` |
| Student          | `id`, `name`, `graduationYear`, `interests[]`, `goals`                                         |
| Match result     | `studentId`, `alumniId`, `reasons[]`                                                           |
| Refresh proposal | `alumniId`, `sourceUrl`, `retrievedAt`, `changes`, `status: "needs-review"`                    |

IDs identify records, not names. Two people may share a name. Years must be integers within the schema's bounds. Lists and strings are bounded. Unknown fields are rejected. These fields omit contact information deliberately; approve data ownership and field visibility before extending the pilot to real data.

### Working now

`GET /api/apps/alumni/records` returns `{ dataset: "synthetic", alumni: Alumnus[], students: Student[] }`. The platform requires active membership and `app.alumni.open`; the app additionally requires `app.alumni.records.read`. HEAD has no body. Writes return 405; unknown operations return 404. The same app module serves the production platform route and the isolated learning preview.

`AlumniRepository` exposes `listAlumni(): Promise<Alumnus[]>` and `listStudents(): Promise<Student[]>`. The initial adapter is read-only and returns independent fixture copies. `readDirectory(context, repository)` enforces the read action and validates the response. UI code calls the guarded API; it never imports storage or server modules.

### Planned task interfaces

These functions do not exist yet; their task owners implement them independently:

- Data: `validateImport(rows: unknown[], existing: Alumnus[]): ImportReport`, where `ImportReport` contains `accepted: Alumnus[]`, `duplicates: string[]`, and `errors: { row: number; message: string }[]`. Rows are 1-based. Existing IDs and repeated IDs in the input are duplicates. First valid occurrence wins; invalid rows do not reserve IDs. No writes.
- Matching: `recommendMatches(student: Student, alumni: Alumnus[]): MatchResult[]`. First exercise: match a student interest to an alumni industry, case-insensitively, and explain that overlap. Keep stable alumni-ID ordering. This exercise is not the final ranking policy.
- Refresh: `proposeRefresh(current: Alumnus, candidate: unknown): RefreshProposal | null`. Candidate includes the exact alumni ID, an HTTPS source URL, a retrieval timestamp and allowed changed fields. Same values return null. Different IDs, invalid input and unsupported fields are rejected. No fetching or writing.
- MCP: a `search_alumni` definition exported from `mcp/tools.ts`, using the shared `defineAppTool` helper and a bounded `query` input. Return a clearly synthetic result from the same repository used by the API. Ivan reviews the `records.read` declaration/visibility and the small registration change in `server.tsx`.

Every operation must keep existing platform authorization. MCP and refresh must not introduce their own database, duplicate matching logic or independent login/deployment. Scheduling the refresh runner is a later platform integration decision: the current app contract does not provide app-owned cron handlers.

### Decisions still needed

Who can view each real field; who can edit profiles; how students identify themselves; recommendations versus assigned pairings; repeated-match policy; alumni availability/consent; permitted refresh sources and cadence; how verified manual edits are protected; and who approves uncertain updates. The starter does not silently decide these policies.
