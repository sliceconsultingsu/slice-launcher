import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { Repository } from "./repository";
import { membershipRequest, errorResponse, PROFILE_EDITS_PER_DAY } from "./api";
import type { View, Member } from "./contracts";
let fixture: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
}, 30_000);
beforeEach(async () => {
  await reset(fixture.db);
});
afterAll(async () => {
  await fixture?.runtime.dispose();
});
it("runs onboarding, approval, privacy checks and revocation against D1", async () => {
  const { db } = fixture;
  const repo = new Repository(db);
  const owner = { subject: "owner", email: "owner@example.test", emailManaged: true };
  const person = { subject: "person", email: "person@example.test", emailManaged: true };
  const call = async (identity: typeof owner, body?: unknown, query = "") => {
    const req = new Request(
      `https://slice.example/api/membership${query}`,
      body
        ? {
            method: "POST",
            headers: { origin: "https://slice.example", "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    );
    try {
      return await membershipRequest(req, identity, repo);
    } catch (e) {
      return errorResponse(e);
    }
  };
  expect(await (await call(person)).json()).toEqual({ needsEnrollment: true });
  let pending = (await (await call(person, { command: { type: "join" } })).json()) as View;
  expect(pending.me.status).toBe("pending");
  expect(pending.members).toEqual([]);
  expect((await call(person, undefined, "?view=history")).status).toBe(403);
  expect(
    (
      await call(person, {
        revision: pending.revision,
        command: {
          type: "member.add",
          name: "Other",
          email: "other@example.test",
          levelId: "member",
        },
      })
    ).status,
  ).toBe(403);
  const admin = (await (await call(owner, { command: { type: "join" } })).json()) as View;
  const approve = {
    type: "member.update",
    id: pending.me.id,
    status: "active",
    levelId: "member",
    owner: false,
    allow: [],
    deny: [],
  };
  expect((await call(owner, { revision: pending.revision, command: approve })).status).toBe(409);
  let current = (await (
    await call(owner, { revision: admin.revision, command: approve })
  ).json()) as View;
  pending = (await (await call(person)).json()) as View;
  expect(pending.me.status).toBe("active");
  expect(pending.members[0]).not.toHaveProperty("email");
  current = (await (
    await call(owner, { revision: current.revision, command: { ...approve, status: "suspended" } })
  ).json()) as View;
  expect((current.members.find((m) => m.id === pending.me.id) as Member).status).toBe("suspended");
  expect(((await (await call(person)).json()) as View).permissions).toEqual([]);
  expect(
    (
      await call(person, {
        revision: current.revision,
        command: { type: "profile.update", name: "Changed", title: "" },
      })
    ).status,
  ).toBe(403);
  expect(await (await call({ ...person, email: "other@example.test" })).json()).toHaveProperty(
    "error",
  );
});

it("rejects invalid envelopes and unrecognized methods without mutating D1", async () => {
  const repo = new Repository(fixture.db);
  const before = await repo.load();
  const identity = { subject: "unknown", email: "unknown@example.test", emailManaged: true };
  const invoke = async (method: string, body?: unknown) => {
    const request = new Request("https://slice.example/api/membership", {
      method,
      headers: { origin: "https://slice.example", "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    try {
      return await membershipRequest(request, identity, repo);
    } catch (error) {
      return errorResponse(error);
    }
  };
  expect((await invoke("DELETE")).status).toBe(405);
  for (const body of [
    { command: { type: "join" }, privilege: "owner" },
    { revision: -1, command: { type: "join" } },
    [],
  ]) {
    expect((await invoke("POST", body)).status).toBe(400);
  }
  expect(
    (
      await invoke("POST", {
        revision: 0,
        command: { type: "profile.update", name: "Unauthorized", title: "" },
      })
    ).status,
  ).toBe(403);
  expect(await repo.load()).toEqual(before);
  expect(await repo.history()).toEqual([]);
});
it("keeps duplicate enrollment idempotent and protects invitations from another identity", async () => {
  const repo = new Repository(fixture.db);
  const owner = { subject: "owner", email: "owner@example.test", emailManaged: true };
  const member = { subject: "invited", email: "invited@example.test", emailManaged: true };
  const call = async (identity: typeof owner, command: unknown) => {
    const { revision } = await repo.load();
    const request = new Request("https://slice.example/api/membership", {
      method: "POST",
      headers: { origin: "https://slice.example", "content-type": "application/json" },
      body: JSON.stringify({ revision, command }),
    });
    try {
      return await membershipRequest(request, identity, repo);
    } catch (error) {
      return errorResponse(error);
    }
  };
  await call(owner, { type: "join" });
  await call(owner, {
    type: "member.add",
    email: member.email,
    name: "Invited",
    levelId: "member",
  });
  await call(
    { subject: "other", email: "other@example.test", emailManaged: true },
    { type: "join" },
  );
  expect(
    (await repo.load()).members.find((entry) => entry.email === member.email)?.subject,
  ).toBeNull();
  const joined = await call(member, { type: "join" });
  expect(((await joined.json()) as View).me.status).toBe("active");
  const before = await repo.load();
  const history = await repo.history();
  expect((await call(member, { type: "join" })).status).toBe(200);
  expect(await repo.load()).toEqual(before);
  expect(await repo.history()).toEqual(history);
  expect((await call({ ...member, subject: "forged-identity" }, { type: "join" })).status).toBe(
    403,
  );
  expect(
    (await call({ ...member, email: "different@example.test" }, { type: "join" })).status,
  ).toBe(403);
  expect(await repo.load()).toEqual(before);
});

async function ownerAndPending() {
  const repo = new Repository(fixture.db);
  const owner = { subject: "owner", email: "owner@example.test", emailManaged: true };
  const person = { subject: "person", email: "person@example.test", emailManaged: true };
  const call = async (
    identity: typeof owner,
    body?: unknown,
    query = "",
    deps: Parameters<typeof membershipRequest>[3] = {},
  ) => {
    const req = new Request(
      `https://slice.example/api/membership${query}`,
      body
        ? {
            method: "POST",
            headers: { origin: "https://slice.example", "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    );
    try {
      return await membershipRequest(req, identity, repo, deps);
    } catch (e) {
      return errorResponse(e);
    }
  };
  await call(owner, { command: { type: "join" } });
  await call(person, { command: { type: "join" } });
  const rename = async (identity: typeof owner, name: string) => {
    const view = (await (await call(identity)).json()) as View;
    return call(identity, {
      revision: view.revision,
      command: { type: "profile.update", name, title: "" },
    });
  };
  return { repo, owner, person, call, rename };
}

it("saving an unchanged profile adds no history entry and no revision", async () => {
  const { repo, person, call, rename } = await ownerAndPending();
  expect((await rename(person, "Pat")).status).toBe(200);
  const before = (await (await call(person)).json()) as View;
  const entries = (await repo.history()).length;
  const again = await rename(person, "Pat");
  expect(again.status).toBe(200);
  expect(((await again.json()) as View).revision).toBe(before.revision);
  expect(await repo.history()).toHaveLength(entries);
});

it("caps how many profile edits one person can add to history in a day", async () => {
  const { repo, owner, person, rename } = await ownerAndPending();
  for (let i = 0; i < PROFILE_EDITS_PER_DAY; i++)
    expect((await rename(person, `Pat ${i}`)).status).toBe(200);
  const refused = await rename(person, "One more");
  expect(refused.status).toBe(429);
  expect(await refused.json()).toEqual({
    error: "You have changed your profile many times today. Try again tomorrow.",
  });
  expect((await repo.load()).members.find((m) => m.subject === "person")?.name).toBe(
    `Pat ${PROFILE_EDITS_PER_DAY - 1}`,
  );
  // One person's cap does not affect anyone else.
  expect((await rename(owner, "Olive")).status).toBe(200);
});

it("refuses changes once the per-person allowance is used up, before touching D1", async () => {
  const { repo, person, call, rename } = await ownerAndPending();
  const seen: string[] = [];
  const view = (await (await call(person)).json()) as View;
  const entries = (await repo.history()).length;
  const refused = await call(
    person,
    { revision: view.revision, command: { type: "profile.update", name: "Pat", title: "" } },
    "",
    {
      allowWrite: async (subject) => {
        seen.push(subject);
        return false;
      },
    },
  );
  expect(refused.status).toBe(429);
  expect(seen).toEqual(["person"]);
  expect(await repo.history()).toHaveLength(entries);
  // Reading is never counted, and a permitted change goes through.
  expect((await call(person, undefined, "", { allowWrite: async () => false })).status).toBe(200);
  expect((await rename(person, "Pat")).status).toBe(200);
});

it("keeps profile edits out of access history unless asked, and pages through the rest", async () => {
  const { owner, person, call, rename } = await ownerAndPending();
  for (let i = 0; i < 5; i++) await rename(person, `Pat ${i}`);
  type Page = { history: { action: string; id: string }[]; next: string | null };
  const read = async (query: string) =>
    (await (await call(owner, undefined, `?view=history${query}`)).json()) as Page;
  const quiet = await read("");
  expect(quiet.history.map((item) => item.action)).toEqual(["member.signin", "member.signin"]);
  expect(quiet.next).toBeNull();
  const everything = await read("&profileEdits=1");
  expect(everything.history).toHaveLength(7);
  expect(everything.history.slice(0, 5).every((item) => item.action === "profile.update")).toBe(
    true,
  );
  for (const bad of ["&before=", "&before=yesterday", "&before=2026-11-16T00:00:00.000Z~x"])
    expect((await call(owner, undefined, `?view=history${bad}`)).status).toBe(400);
});
