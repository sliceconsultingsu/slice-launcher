// Test-only helper: invented members with different permissions, and the same two checks the
// platform makes before it runs app code. A page, API route or assistant tool only runs after
// authorizeApp accepts the member; each tool then also requires its own declared action.
import type { State } from "../../../src/membership/contracts";
import { authorizeApp } from "../../../src/platform/access";
import type {
  AppApiProps,
  AppContext,
  AppDescriptor,
  AppTool,
} from "../../../src/platform/contracts";
import { createPlatform } from "../../../src/platform/dispatch";
import real from "../app.json";

/**
 * The app's descriptor with nothing coming with access, so every action here is a power given
 * to a named person. In production "records.read" comes with access; taking that away in tests
 * lets each action's own check be exercised on its own.
 */
export const descriptor: AppDescriptor = {
  ...real,
  permissions: real.permissions.map(({ id, label }) => ({ id, label })),
};

const READ = "records.read";
const ADMIN = "admin";
const REFRESH = "refresh.run";
const people = {
  /** An ordinary student: may browse, keep a profile and receive matches. */
  "member-example-01": { name: "Riley Chen", status: "active", powers: [READ] },
  "member-example-02": { name: "Amara Okonkwo", status: "active", powers: [READ] },
  "member-example-new": { name: "Morgan Example", status: "active", powers: [READ] },
  "member-example-admin": { name: "Avery Admin", status: "active", powers: [READ, ADMIN] },
  "member-example-runner": { name: "Robin Runner", status: "active", powers: [REFRESH] },
  /** May open the app but holds none of its actions. */
  "member-example-opener": { name: "Olive Opener", status: "active", powers: [] },
  "member-example-suspended": {
    name: "Sam Suspended",
    status: "suspended",
    powers: [READ, ADMIN, REFRESH],
  },
} as const;
export type TestMember = keyof typeof people;

export const membership: State = {
  revision: 0,
  ownerEmail: null,
  ownerClaimed: true,
  levels: [],
  memberApps: [],
  members: Object.entries(people).map(([id, person]) => ({
    id,
    subject: `test|${id}`,
    email: `${id}@example.test`,
    name: person.name,
    title: "",
    status: person.status,
    levelId: null,
    allow: [],
    deny: [],
    owner: false,
    joinedAt: "2026-10-26",
  })),
  // Everyone here is on the app; what differs is the powers each was given.
  apps: [
    {
      id: "alumni",
      visibility: "private",
      managers: [],
      people: Object.entries(people).map(([memberId, person]) => ({
        memberId,
        powers: [...person.powers],
      })),
    },
  ],
};

export function identityOf(member: TestMember) {
  return { subject: `test|${member}`, email: `${member}@example.test` };
}

/** The context the platform would build for this member; throws 403 for a suspended member. */
export function contextFor(member: TestMember): AppContext {
  return authorizeApp(membership, identityOf(member), descriptor);
}

/** Calls a tool the way the platform's MCP adapter does: membership, then the action, then run. */
export async function callTool(tool: AppTool, member: TestMember, input: unknown = {}) {
  const context = contextFor(member);
  context.requirePermission(tool.permission);
  return tool.execute(tool.inputSchema.parse(input), context);
}

export function toolNamed(tools: readonly AppTool[], name: string): AppTool {
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  return tool;
}

const ORIGIN = "https://slice.example.test";

/**
 * Sends a request through the platform's real dispatch as this member, so the membership check,
 * the app's own permission checks and the same-origin rule for writes all run as in production.
 */
export function apiAs(api: (props: AppApiProps) => Response | Promise<Response>) {
  return async (member: TestMember, method: string, path: string, body?: unknown) => {
    const platform = createPlatform({
      catalog: [descriptor],
      modules: new Map([["alumni", { Page: () => null, api }]]),
      verify: async () => identityOf(member),
      loadState: async () => membership,
    });
    const [pathname = "", query = ""] = path.split("?");
    const response = await platform.api(
      new Request(`${ORIGIN}/api/apps/alumni/${pathname}${query ? `?${query}` : ""}`, {
        method,
        headers:
          body === undefined ? undefined : { "content-type": "application/json", origin: ORIGIN },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      "alumni",
      pathname.split("/").filter(Boolean),
    );
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  };
}
