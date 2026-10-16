// Evaluation harness: real verifyIdentity -> membershipRequest -> Repository on Miniflare D1,
// composed exactly like app/api/membership/route.ts. Identities are synthetic (@example.test) and
// signed with a per-run RS256 key that never leaves memory.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyIdentity } from "../../src/membership/auth";
import { errorResponse, membershipRequest } from "../../src/membership/api";
import { Repository } from "../../src/membership/repository";
import type { Audit, Member, View } from "../../src/membership/contracts";
import { database, migrate, reset } from "../database";

export const config = {
  issuer: "https://slice-eval.cloudflareaccess.com",
  audience: "slice-eval-audience",
};
export type Fixture = Awaited<ReturnType<typeof database>>;
export type Db = Fixture["db"];
export interface Person {
  sub: string;
  email: string;
}
export const people = {
  owner: { sub: "owner-sub", email: "owner@example.test" },
  bea: { sub: "bea-sub", email: "bea@example.test" },
  carol: { sub: "carol-sub", email: "carol@example.test" },
  dan: { sub: "dan-sub", email: "dan@example.test" },
  erin: { sub: "erin-sub", email: "erin@example.test" },
} satisfies Record<string, Person>;
export const subjectOf = (person: Person) => `${config.issuer}|${person.sub}`;

export async function openFixture(): Promise<Fixture> {
  const fixture = await database();
  await migrate(fixture.db);
  return fixture;
}
export { reset };

export async function signer() {
  const pair = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "slice-eval" }],
  });
  const token = (person: Person) =>
    new SignJWT({ type: "app", sub: person.sub, email: person.email })
      .setProtectedHeader({ alg: "RS256", kid: "slice-eval" })
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(pair.privateKey);
  return { keys, token };
}
export type Signer = Awaited<ReturnType<typeof signer>>;

/** HTTP-level client. `repository` defaults to a fresh Repository per request, like the route. */
export function client(db: Db, auth: Signer) {
  const send = async (
    person: Person,
    body?: unknown,
    options: { query?: string; repository?: Repository } = {},
  ): Promise<Response> => {
    const jwt = await auth.token(person);
    const url = `https://slice.example/api/membership${options.query ?? ""}`;
    const request =
      body === undefined
        ? new Request(url, { headers: { "Cf-Access-Jwt-Assertion": jwt } })
        : new Request(url, {
            method: "POST",
            headers: {
              "Cf-Access-Jwt-Assertion": jwt,
              origin: "https://slice.example",
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          });
    try {
      const identity = await verifyIdentity(request, config, auth.keys);
      return await membershipRequest(request, identity, options.repository ?? new Repository(db));
    } catch (error) {
      return errorResponse(error);
    }
  };
  const view = async (person: Person) => (await (await send(person)).json()) as View;
  const join = (person: Person, repository?: Repository) =>
    send(person, { command: { type: "join" } }, { repository });
  const command = (person: Person, revision: number, cmd: unknown, repository?: Repository) =>
    send(person, { revision, command: cmd }, { repository });
  const history = async (person: Person, query = "?view=history") =>
    (await (await send(person, undefined, { query })).json()) as { history: Audit[] };
  return { send, view, join, command, history };
}
export type Client = ReturnType<typeof client>;

export const memberUpdate = (
  id: string,
  status: Member["status"],
  extra: Partial<Member> = {},
) => ({
  type: "member.update",
  id,
  status,
  levelId: "member",
  allow: [],
  deny: [],
  owner: false,
  ...extra,
});

/** Owner (bootstrap), delegated admin Bea (members/levels/audit), pending Carol. */
export async function standardOrg(api: Client) {
  const owner = (await (await api.join(people.owner)).json()) as View;
  const bea = (await (await api.join(people.bea)).json()) as View;
  const approved = await api.command(
    people.owner,
    bea.revision,
    memberUpdate(bea.me.id, "active", {
      allow: ["audit.read", "levels.manage", "members.manage"],
    }),
  );
  if (approved.status !== 200) throw new Error(`setup failed: ${await approved.text()}`);
  const carol = (await (await api.join(people.carol)).json()) as View;
  return { ownerId: owner.me.id, beaId: bea.me.id, carolId: carol.me.id, revision: carol.revision };
}

export function inspect(db: Db) {
  const scalar = async (sql: string) => Number(await db.prepare(sql).first("value"));
  return {
    revision: () => scalar("SELECT revision AS value FROM organization WHERE id = 'slice'"),
    auditCount: () => scalar("SELECT COUNT(*) AS value FROM access_audit"),
    guardCount: () => scalar("SELECT COUNT(*) AS value FROM mutation_guard"),
    memberCount: () => scalar("SELECT COUNT(*) AS value FROM members"),
    levelCount: () => scalar("SELECT COUNT(*) AS value FROM access_levels"),
    audits: async () =>
      (
        await db.prepare("SELECT document FROM access_audit ORDER BY rowid").all<{
          document: string;
        }>()
      ).results.map((row: { document: string }) => JSON.parse(row.document) as Audit),
    member: async (id: string) => {
      const row = await db
        .prepare("SELECT document FROM members WHERE id = ?")
        .bind(id)
        .first<{ document: string }>();
      return row ? (JSON.parse(row.document) as Member) : null;
    },
    level: async (id: string) => {
      const row = await db
        .prepare("SELECT document FROM access_levels WHERE id = ?")
        .bind(id)
        .first<{ document: string }>();
      return row ? (JSON.parse(row.document) as unknown) : null;
    },
  };
}

/** Releases every caller once `parties` callers have arrived (or after a safety timeout). */
export function barrier(parties: number, timeoutMs = 3000) {
  let arrived = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
    setTimeout(resolve, timeoutMs);
  });
  return async () => {
    arrived += 1;
    if (arrived >= parties) release();
    await gate;
  };
}
/** Forces the worst-case interleaving: every request finishes load() before any commit runs. */
export class GatedRepository extends Repository {
  constructor(
    db: Db,
    private readonly gate: () => Promise<void>,
  ) {
    super(db);
  }
  override async load() {
    const state = await super.load();
    await this.gate();
    return state;
  }
}
