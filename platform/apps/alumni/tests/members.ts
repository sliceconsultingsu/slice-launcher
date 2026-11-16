// Test-only helper: invented members with different permissions, and the same two checks the
// platform makes before it runs app code. A page, API route or assistant tool only runs after
// authorizeApp accepts the member; each tool then also requires its own declared action.
import type { State } from "../../../src/membership/contracts";
import { authorizeApp } from "../../../src/platform/access";
import type { AppApiProps, AppContext, AppTool } from "../../../src/platform/contracts";
import { createPlatform } from "../../../src/platform/dispatch";
import descriptor from "../app.json";

const OPEN = "app.alumni.open";
const READ = "app.alumni.records.read";
const ADMIN = "app.alumni.admin";
const REFRESH = "app.alumni.refresh.run";
const people = {
  /** An ordinary student: may browse, keep a profile and receive matches. */
  "member-example-01": { name: "Riley Chen", status: "active", allow: [OPEN, READ] },
  "member-example-02": { name: "Amara Okonkwo", status: "active", allow: [OPEN, READ] },
  "member-example-new": { name: "Morgan Example", status: "active", allow: [OPEN, READ] },
  "member-example-admin": { name: "Avery Admin", status: "active", allow: [OPEN, READ, ADMIN] },
  "member-example-runner": { name: "Robin Runner", status: "active", allow: [OPEN, REFRESH] },
  /** May open the app but holds none of its actions. */
  "member-example-opener": { name: "Olive Opener", status: "active", allow: [OPEN] },
  "member-example-suspended": {
    name: "Sam Suspended",
    status: "suspended",
    allow: [OPEN, READ, ADMIN, REFRESH],
  },
} as const;
export type TestMember = keyof typeof people;

export const membership: State = {
  revision: 0,
  ownerEmail: null,
  ownerClaimed: true,
  levels: [],
  members: Object.entries(people).map(([id, person]) => ({
    id,
    subject: `test|${id}`,
    email: `${id}@example.test`,
    name: person.name,
    title: "",
    status: person.status,
    levelId: null,
    allow: [...person.allow],
    deny: [],
    owner: false,
    joinedAt: "2026-10-26",
  })),
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
