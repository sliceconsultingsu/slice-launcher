# The Builder's Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member's AI can read a guide and a starter app, publish a preview only the app's managers see, and send a larger app from a folder through a one-time address.

**Architecture:** Three small additions to member apps. Preview is one more field in the registry and one branch in the front door. The upload address is a one-time token in the database that stands in for the member when the files arrive. The guide is text and a few files the launcher hands to the AI.

**Tech Stack:** as member apps.

**Spec:** `docs/superpowers/specs/2026-11-19-app-builder-kit-design.md`.

## Global Constraints

- Only the people who run an app (its managers and owners) are ever served its preview. Everyone else gets the live version exactly as before.
- One preview per app. A live publish, making the preview live, or discarding it clears it.
- An upload address lasts ten minutes, works once, and only for the app and member it was made for. Only a hash of it is stored. Membership and who runs the app are checked again when it is used.
- Limits through an upload address: 100 files, 2 MB per file, 5 MB in total, 8 MB request. Through a tool call: unchanged.
- The guide says only what the launcher does. A test holds its stated limits to the code's constants.
- Everything stays behind the member apps switch.

## Review Focus

- A manager demoted between two requests while viewing a preview.
- A preview of an app that has never been live, opened by someone on the app who does not run it.
- An upload address replayed, expired, or used after the member was suspended or stopped running the app.
- An upload body that is not JSON, or larger than the limit.
- The starter app's files must themselves pass the launcher's publish rules.

---

### Task 1: Preview

**Files:** modify `membership/contracts.ts`, `membership/domain.ts`, `member-apps/service.ts`, `front-door.ts`, `pass-route.ts`, `info.ts`, `tools.ts`, `lib/member-app-model.ts`, `lib/member-about-view.tsx`; tests beside each.

**Interfaces (produced):** `MemberApp.preview: number | null`; `memberapp.publish` takes `preview: boolean`; `memberapp.preview {id, version: number | null}`; `MemberApps.publish(identity, id, value, { preview?: boolean, large?: boolean })`; `shownVersion(app, runs): number | null` in `registry.ts`.

- [ ] Tests first, then code. Commit.

### Task 2: The upload address

**Files:** create `member-apps/uploads.ts`, `member-apps/upload-route.ts`, `app/api/app-upload/[token]/route.ts`, `migrations/0012_app_uploads.sql`; modify `publish.ts` (larger limits), `tools.ts`, `service.ts`.

**Interfaces (produced):** `startUpload(db, identity, appId, preview): Promise<string>`; `takeUpload(db, token): Promise<{ appId; identity; preview } | null>`; `uploadRequest(request, token, deps): Promise<Response>`; `MemberApps.upload(identity, id, { preview })`.

- [ ] Tests first, then code. Commit.

### Task 3: The guide and the starter app

**Files:** create `member-apps/guide.ts`; modify `tools.ts`, `app/connect-ai/page.tsx`, `src/connect-ai/`; `docs/member-apps.md`.

- [ ] Tests first: the starter passes `readBundle`; the guide names the real limits; the tool is offered. Then code. Full gate, push, pull request.
