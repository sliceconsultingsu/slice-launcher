// Scenario 8: stored documents that pass json_valid() but do not match the Member/Level shape.
// Such rows can only come from operator SQL (bootstrap/recovery), a future backfill or a partial
// restore; the application itself always writes JSON.stringify(domain object).
// Tests marked [finding] assert the safe behaviour we would expect and FAIL on the current code; they are declared with it.fails so the suite stays green until a fix lands, then must be converted to it().
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { effectivePermissions } from "../../src/membership/domain";
import { Repository } from "../../src/membership/repository";
import { authorizeMember } from "../../src/platform/access";
import type { View } from "../../src/membership/contracts";
import {
  client,
  inspect,
  memberUpdate,
  openFixture,
  people,
  reset,
  signer,
  standardOrg,
  subjectOf,
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

async function orgWithActiveCarol() {
  const ids = await standardOrg(api);
  const activated = await api.command(
    people.owner,
    ids.revision,
    memberUpdate(ids.carolId, "active"),
  );
  expect(activated.status).toBe(200);
  return ids;
}
const corrupt = (id: string, expression: string) =>
  fixture.db.prepare(`UPDATE members SET document = ${expression} WHERE id = ?`).bind(id).run();
const errorOf = async (response: Response) => ((await response.json()) as { error?: string }).error;

describe("scenario 8a: active member document missing `allow`", () => {
  it("load() does not validate; effectivePermissions throws TypeError (crash, not a 403)", async () => {
    const { carolId } = await orgWithActiveCarol();
    await corrupt(carolId, "json_remove(document, '$.allow')");
    const state = await new Repository(fixture.db).load();
    const carol = state.members.find((m) => m.id === carolId);
    expect(carol && "allow" in carol).toBe(false);
    expect(() => effectivePermissions(state, carol as never)).toThrow(TypeError);
  });

  it("the affected member is denied (500, generic message); other members and the owner still load", async () => {
    const { carolId } = await orgWithActiveCarol();
    await corrupt(carolId, "json_remove(document, '$.allow')");
    const carol = await api.send(people.carol);
    expect(carol.status).toBe(500);
    expect(await errorOf(carol)).toBe("Membership could not be loaded. Please try again.");
    expect((await api.send(people.bea)).status).toBe(200);
    expect((await api.send(people.owner)).status).toBe(200);
  });

  it.fails(
    "known defect (2026-10-16): an owner can repair the record through the normal member editor",
    async () => {
      const { carolId } = await orgWithActiveCarol();
      await corrupt(carolId, "json_remove(document, '$.allow')");
      const revision = (await api.view(people.owner)).revision;
      const repair = await api.command(people.owner, revision, memberUpdate(carolId, "active"));
      console.info(`[eval] owner repair of member missing allow: HTTP ${repair.status}`);
      expect(repair.status).toBe(200);
    },
  );

  it.fails(
    "known defect (2026-10-16): one malformed member does not block owners from editing the default Member level",
    async () => {
      const { carolId } = await orgWithActiveCarol();
      await corrupt(carolId, "json_remove(document, '$.allow')");
      const revision = (await api.view(people.owner)).revision;
      const edit = await api.command(people.owner, revision, {
        type: "level.save",
        id: "member",
        name: "Member",
        permissions: ["audit.read", "members.read"],
      });
      console.info(
        `[eval] owner edit of Member level with one malformed member: HTTP ${edit.status}`,
      );
      expect(edit.status).toBe(200);
    },
  );
});

describe("scenario 8b: a member document that is JSON null", () => {
  it.fails(
    "known defect (2026-10-16): one null row does not take down membership for everyone else",
    async () => {
      await orgWithActiveCarol();
      // Rows load ORDER BY id; an id sorting first makes every Array.find() scan reach the null.
      // (With a random id, members whose row sorts before it are unaffected; newcomers never are.)
      await fixture.db
        .prepare(
          "INSERT INTO members(id, email, subject, document) VALUES ('00000000-null', 'null-row@example.test', NULL, 'null')",
        )
        .run();
      const statuses = {
        owner: (await api.send(people.owner)).status,
        bea: (await api.send(people.bea)).status,
        newcomerJoin: (await api.join(people.dan)).status,
      };
      let appGate = "ok";
      try {
        authorizeMember(await new Repository(fixture.db).load(), {
          subject: subjectOf(people.owner),
          email: people.owner.email,
        });
      } catch (error) {
        appGate = error instanceof Error ? error.constructor.name : "unknown";
      }
      console.info(`[eval] null member row -> ${JSON.stringify(statuses)}, app gate: ${appGate}`);
      expect(statuses).toEqual({ owner: 200, bea: 200, newcomerJoin: 200 });
      expect(appGate).toBe("ok");
    },
  );
});

describe("scenario 8c: wrongly typed fields", () => {
  it.fails(
    'known defect (2026-10-16): owner stored as the JSON string "false" does not grant ownership',
    async () => {
      const { carolId, ownerId } = await orgWithActiveCarol();
      // A plausible operator mistake: json_set with the TEXT 'false' stores a JSON string.
      await corrupt(carolId, "json_set(document, '$.owner', 'false')");
      const raw = await fixture.db
        .prepare("SELECT json_type(document, '$.owner') AS t FROM members WHERE id = ?")
        .bind(carolId)
        .first("t");
      expect(raw).toBe("text");
      const view = await api.view(people.carol);
      console.info(`[eval] carol permissions with owner:"false": ${view.permissions.join(", ")}`);
      const suspendRealOwner = await api.command(people.carol, view.revision, {
        ...memberUpdate(ownerId, "suspended"),
      });
      console.info(`[eval] carol suspends the real owner: HTTP ${suspendRealOwner.status}`);
      const owner = await inspect(fixture.db).member(ownerId);
      expect(view.permissions).toEqual(["members.read"]);
      expect(suspendRealOwner.status).toBe(403);
      expect(owner?.status).toBe("active");
    },
  );

  it('characterization: status with different case ("Active") fails closed', async () => {
    const { carolId } = await orgWithActiveCarol();
    await corrupt(carolId, "json_set(document, '$.status', 'Active')");
    const view = (await (await api.send(people.carol)).json()) as View;
    expect(view.permissions).toEqual([]);
  });

  it("characterization: level document missing `permissions` -> reads fine, assigning it crashes (500)", async () => {
    const { carolId } = await orgWithActiveCarol();
    await fixture.db
      .prepare(
        'INSERT INTO access_levels(id, name, document) VALUES (\'broken\', \'Broken\', \'{"id":"broken","name":"Broken"}\')',
      )
      .run();
    const view = await api.view(people.owner);
    expect(view.levels.map((l) => l.id)).toContain("broken");
    const assign = await api.command(
      people.owner,
      view.revision,
      memberUpdate(carolId, "active", { levelId: "broken" }),
    );
    console.info(`[eval] assigning level without permissions: HTTP ${assign.status}`);
    expect(assign.status).toBe(500);
  });

  it("characterization: email column and document can diverge; app reads only the document", async () => {
    const { carolId } = await orgWithActiveCarol();
    await fixture.db
      .prepare("UPDATE members SET email = 'renamed@example.test' WHERE id = ?")
      .bind(carolId)
      .run();
    expect((await api.send(people.carol)).status).toBe(200); // document email still matches token
    const revision = (await api.view(people.owner)).revision;
    const add = await api.command(people.owner, revision, {
      type: "member.add",
      email: "renamed@example.test",
      name: "Renamed",
      levelId: "member",
    });
    console.info(`[eval] invite colliding only with the stale column: HTTP ${add.status}`);
    expect(add.status).toBe(500);
  });
});
