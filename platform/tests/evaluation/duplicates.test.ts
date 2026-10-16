// Scenario 3: duplicate joins and invitations, including email case variants.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { View } from "../../src/membership/contracts";
import {
  barrier,
  client,
  GatedRepository,
  inspect,
  openFixture,
  people,
  reset,
  signer,
  standardOrg,
} from "./harness";
import type { Client, Fixture, Signer } from "./harness";

let fixture: Fixture;
let auth: Signer;
let api: Client;
beforeAll(async () => {
  fixture = await openFixture();
  auth = await signer();
  api = client(fixture.db, auth);
}, 30_000);
beforeEach(async () => reset(fixture.db));
afterAll(async () => fixture?.runtime.dispose());

const membersWithEmail = async (email: string) =>
  Number(
    await fixture.db
      .prepare("SELECT COUNT(*) AS n FROM members WHERE email = ?")
      .bind(email)
      .first("n"),
  );

describe("scenario 3: duplicate join", () => {
  it("same join twice sequentially: one member, one audit row, second call is a 200 no-op", async () => {
    await standardOrg(api);
    const db = inspect(fixture.db);
    const audits = await db.auditCount();
    const first = await api.join(people.dan);
    const second = await api.join(people.dan);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await membersWithEmail(people.dan.email)).toBe(1);
    expect(await db.auditCount()).toBe(audits + 1);
  });

  it("same join twice concurrently (forced interleave): one member, one audit row, loser gets clean 409", async () => {
    await standardOrg(api);
    const db = inspect(fixture.db);
    const audits = await db.auditCount();
    const gate = barrier(2);
    const responses = await Promise.all([
      api.join(people.dan, new GatedRepository(fixture.db, gate)),
      api.join(people.dan, new GatedRepository(fixture.db, gate)),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await membersWithEmail(people.dan.email)).toBe(1);
    expect(await db.auditCount()).toBe(audits + 1);
    expect(await db.guardCount()).toBe(0);
    // A later retry by the losing tab is a harmless no-op.
    expect((await api.join(people.dan)).status).toBe(200);
  });

  it("same join twice concurrently, free-running x10: never two members or two audit rows", async () => {
    const outcomes: string[] = [];
    for (let round = 0; round < 10; round += 1) {
      await reset(fixture.db);
      await standardOrg(api);
      const audits = await inspect(fixture.db).auditCount();
      const [a, b] = await Promise.all([api.join(people.dan), api.join(people.dan)]);
      outcomes.push(`${a.status}/${b.status}`);
      expect([a.status, b.status].every((s) => s === 200 || s === 409)).toBe(true);
      expect(await membersWithEmail(people.dan.email)).toBe(1);
      expect(await inspect(fixture.db).auditCount()).toBe(audits + 1);
    }
    console.info(`[eval] free-running duplicate join outcomes: ${outcomes.join(", ")}`);
  });

  it("characterization: two DIFFERENT new people signing in at the same moment -> one gets 409", async () => {
    await standardOrg(api);
    const gate = barrier(2);
    const [dan, erin] = await Promise.all([
      api.join(people.dan, new GatedRepository(fixture.db, gate)),
      api.join(people.erin, new GatedRepository(fixture.db, gate)),
    ]);
    const statuses = [dan.status, erin.status].sort();
    console.info(`[eval] concurrent first sign-in of two different people: ${statuses.join("/")}`);
    expect(statuses).toEqual([200, 409]);
    const loser = (await (dan.status === 409 ? dan : erin).json()) as { error: string };
    expect(loser.error).toBe("Membership changed. Reload and try again.");
  });
});

describe("scenario 3: duplicate invitations and email case", () => {
  it("duplicate member.add for the same email (sequential) -> 409, one record", async () => {
    await standardOrg(api);
    const add = { type: "member.add", email: "dana@example.test", name: "Dana", levelId: "member" };
    expect(
      (await api.command(people.owner, (await api.view(people.owner)).revision, add)).status,
    ).toBe(200);
    const again = await api.command(people.owner, (await api.view(people.owner)).revision, add);
    expect(again.status).toBe(409);
    expect(await membersWithEmail("dana@example.test")).toBe(1);
  });

  it("member.add with case variants of an existing email -> 409; stored email is lowercase", async () => {
    await standardOrg(api);
    const revision = (await api.view(people.owner)).revision;
    const added = await api.command(people.owner, revision, {
      type: "member.add",
      email: "Dana.Case@Example.TEST",
      name: "Dana",
      levelId: "member",
    });
    expect(added.status).toBe(200);
    const stored = await fixture.db
      .prepare("SELECT email, document FROM members WHERE email = 'dana.case@example.test'")
      .first<{ email: string; document: string }>();
    expect(stored?.email).toBe("dana.case@example.test");
    expect(JSON.parse(stored?.document ?? "{}").email).toBe("dana.case@example.test");
    for (const variant of [
      "dana.case@example.test",
      "DANA.CASE@EXAMPLE.TEST",
      "dAnA.cAsE@example.test",
    ]) {
      const r = await api.command(people.owner, (await api.view(people.owner)).revision, {
        type: "member.add",
        email: variant,
        name: "Dana again",
        levelId: "member",
      });
      expect(r.status).toBe(409);
    }
    expect(await membersWithEmail("dana.case@example.test")).toBe(1);
  });

  it("an invitation in mixed case binds to a sign-in whose token email is upper case", async () => {
    await standardOrg(api);
    await api.command(people.owner, (await api.view(people.owner)).revision, {
      type: "member.add",
      email: "Erin@Example.Test",
      name: "Erin",
      levelId: "member",
    });
    const joined = await api.join({ sub: people.erin.sub, email: "ERIN@EXAMPLE.TEST" });
    expect(joined.status).toBe(200);
    expect(((await joined.json()) as View).me.status).toBe("active");
    expect(await membersWithEmail("erin@example.test")).toBe(1);
  });

  it("two admins concurrently inviting the same email: one 200, one 409, one record", async () => {
    await standardOrg(api);
    const revision = (await api.view(people.owner)).revision;
    const gate = barrier(2);
    const add = (email: string) => ({ type: "member.add", email, name: "Dup", levelId: "member" });
    const responses = await Promise.all([
      api.command(
        people.owner,
        revision,
        add("dup@example.test"),
        new GatedRepository(fixture.db, gate),
      ),
      api.command(
        people.bea,
        revision,
        add("DUP@example.test"),
        new GatedRepository(fixture.db, gate),
      ),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await membersWithEmail("dup@example.test")).toBe(1);
    expect(await inspect(fixture.db).guardCount()).toBe(0);
  });
});
