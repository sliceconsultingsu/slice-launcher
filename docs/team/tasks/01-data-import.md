# Task 1: Check an alumni import before saving it

**Owner:** person 1, pending assignment. **Depends on:** merged starter or its branch. No other teammate's task is required.

## Outcome

A maintainer can inspect a proposed import and see which fictional rows are valid, duplicated or invalid. This first task does not save data.

## Scope

Create `platform/apps/alumni/data/import.ts` and `import.test.ts`. Implement `validateImport(rows, existing)` with the exact `ImportReport` contract in [shared contracts](../contracts.md). Reuse `alumniSchema`. Do not change `contracts.ts`, `data.ts`, `server.tsx`, migrations or permission files without an agreed integration change.

## Acceptance examples

- Three valid fixture rows against an empty list produce three accepted records and no errors.
- Existing `alum-001` plus a proposed row with that ID produces a duplicate, not a new record.
- Repeated valid IDs within the file accept the first occurrence and report the repeat. An invalid row does not reserve an ID.
- A missing name, noninteger graduation year or unknown field reports the 1-based row and a useful error.
- Neither input array nor its records are mutated; nothing writes to storage.

Start with one failing behavior test, implement it, then add the remaining cases. Run `corepack pnpm --filter @slice/launcher exec vitest run apps/alumni/data/import.test.ts`. Show Ivan the accepted/duplicate/error report for a mixed example, then run the full contributor checks and open a PR.

**Later:** approved persistent storage and an import review screen. Those need a separate schema/migration and permissions review.
