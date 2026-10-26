# Common alumni interfaces

These are the development baseline for parallel work, not final client-approved requirements. Propose shared changes to Ivan before implementing them in multiple branches.

The source of truth is [`contracts.ts`](../../platform/apps/alumni/contracts.ts). All example people and companies in [`fixtures.ts`](../../platform/apps/alumni/fixtures.ts) are invented. Do not add real records to this public repository.

| Record           | Fields                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Alumni           | `id`, `name`, `graduationYear`, `company`, `role`, `industry`, `expertise[]`, `lastVerifiedAt` |
| Student          | `id`, `name`, `graduationYear`, `interests[]`, `goals`                                         |
| Match result     | `studentId`, `alumniId`, `reasons[]`                                                           |
| Refresh proposal | `alumniId`, `sourceUrl`, `retrievedAt`, `changes`, `status: "needs-review"`                    |

IDs identify records, not names. Two people may share a name. Years must be integers within the schema's bounds. Lists and strings are bounded. Unknown fields are rejected. These fields omit contact information deliberately; approve data ownership and field visibility before extending the pilot to real data.

## Working now

`GET /api/apps/alumni/records` returns `{ dataset: "synthetic", alumni: Alumnus[], students: Student[] }`. The platform requires active membership and `app.alumni.open`; the app additionally requires `app.alumni.records.read`. HEAD has no body. Writes return 405; unknown operations return 404. The same app module serves the production platform route and the isolated learning preview.

`AlumniRepository` exposes `listAlumni(): Promise<Alumnus[]>` and `listStudents(): Promise<Student[]>`. The initial adapter is read-only and returns independent fixture copies. `readDirectory(context, repository)` enforces the read action and validates the response. UI code calls the guarded API; it never imports storage or server modules.

## Planned task interfaces

These functions do not exist yet; their task owners implement them independently:

- Data: `validateImport(rows: unknown[], existing: Alumnus[]): ImportReport`, where `ImportReport` contains `accepted: Alumnus[]`, `duplicates: string[]`, and `errors: { row: number; message: string }[]`. Rows are 1-based. Existing IDs and repeated IDs in the input are duplicates. First valid occurrence wins; invalid rows do not reserve IDs. No writes.
- Matching: `recommendMatches(student: Student, alumni: Alumnus[]): MatchResult[]`. First exercise: match a student interest to an alumni industry, case-insensitively, and explain that overlap. Keep stable alumni-ID ordering. This exercise is not the final ranking policy.
- Refresh: `proposeRefresh(current: Alumnus, candidate: unknown): RefreshProposal | null`. Candidate includes the exact alumni ID, an HTTPS source URL, a retrieval timestamp and allowed changed fields. Same values return null. Different IDs, invalid input and unsupported fields are rejected. No fetching or writing.
- MCP: a `search_alumni` definition exported from `mcp/tools.ts`, using the shared `defineAppTool` helper and a bounded `query` input. Return a clearly synthetic result from the same repository used by the API. Ivan reviews the `records.read` declaration/visibility and the small registration change in `server.tsx`.

Every operation must keep existing platform authorization. MCP and refresh must not introduce their own database, duplicate matching logic or independent login/deployment. Scheduling the refresh runner is a later platform integration decision: the current app contract does not provide app-owned cron handlers.

## Decisions still needed

Who can view each real field; who can edit profiles; how students identify themselves; recommendations versus assigned pairings; repeated-match policy; alumni availability/consent; permitted refresh sources and cadence; how verified manual edits are protected; and who approves uncertain updates. The starter does not silently decide these policies.
