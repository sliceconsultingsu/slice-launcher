import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  type AuthRequest,
  type CompleteAuthorizationOptions,
  type ConsentDescription,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { authorize } from "./consent";
import { grantUserId } from "./oauth";
import { emptyState, enroll } from "../membership/domain";
import type { Identity, State } from "../membership/contracts";
import { MembershipError } from "../membership/contracts";

const origin = "https://slice.example";
const identity: Identity = {
  subject: "https://test.cloudflareaccess.com|consent",
  email: "consent@example.test",
};
const authRequest = {
  responseType: "code",
  clientId: "client-1",
  redirectUri: "https://client.example/cb",
  scope: ["slice"],
  state: "state-1",
} as AuthRequest;

function memberState(status: "active" | "pending" | "suspended" = "active"): State {
  const state = enroll(emptyState(null), identity, { id: "consent", now: "synthetic" }).state;
  state.members[0].status = status;
  return state;
}

function fakeHelpers(description: Partial<ConsentDescription> = {}) {
  const completed: CompleteAuthorizationOptions[] = [];
  const usedHandles = new Set<string>();
  const helpers = {
    async parseAuthRequest(request: Request) {
      if (!new URL(request.url).searchParams.get("client_id"))
        throw new AuthorizationError("invalid_request", { description: "Missing client." });
      return authRequest;
    },
    async describeConsent() {
      return {
        clientId: "client-1",
        clientName: "Claude",
        redirectUri: "https://client.example/cb",
        redirectHost: "client.example",
        redirectIsLoopback: false,
        ...description,
      } as ConsentDescription;
    },
    async beginConsent() {
      return {
        handle: "handle-1",
        headers: new Headers({ "Set-Cookie": "__Host-oauth-consent=1" }),
      };
    },
    async approveConsent(_request: Request, handle: string) {
      if (handle !== "handle-1" || usedHandles.has(handle))
        throw new AuthorizationError("access_denied", { description: "Expired." });
      usedHandles.add(handle);
      return { request: authRequest, headers: new Headers() };
    },
    async denyConsent(_request: Request, handle: string) {
      if (handle !== "handle-1")
        throw new AuthorizationError("access_denied", { description: "Expired." });
      return {
        request: authRequest,
        redirectTo: "https://client.example/cb?error=access_denied&state=state-1",
        headers: new Headers(),
      };
    },
    async completeAuthorization(options: CompleteAuthorizationOptions) {
      completed.push(options);
      return { redirectTo: "https://client.example/cb?code=abc&state=state-1" };
    },
  } as unknown as OAuthHelpers;
  return { helpers, completed };
}

function deps(
  helpers: OAuthHelpers,
  state: State = memberState(),
  who: Identity | null = identity,
) {
  return {
    helpers,
    identify: async () => {
      if (!who) throw new MembershipError(401, "Sign in required.");
      return who;
    },
    loadState: async () => state,
  };
}

const page = () => new Request(`${origin}/authorize?client_id=client-1&response_type=code`);
function post(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(`${origin}/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, ...headers },
    body: new URLSearchParams(fields),
  });
}

describe("approval page", () => {
  it("invalid request shows Cannot connect", async () => {
    const { helpers } = fakeHelpers();
    const response = await authorize(new Request(`${origin}/authorize`), deps(helpers));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Cannot connect");
  });

  it.each(["pending", "suspended"] as const)(
    "%s member sees an explanation and the app receives access_denied",
    async (status) => {
      const { helpers, completed } = fakeHelpers();
      const response = await authorize(page(), deps(helpers, memberState(status)));
      expect(response.status).toBe(403);
      const body = await response.text();
      expect(body).toContain("Membership required");
      expect(body).toMatch(/href="https:\/\/client\.example\/cb\?[^"]*error=access_denied/);
      expect(completed).toHaveLength(0);
    },
  );

  it("someone not signed in is sent to Google sign-in and back to this page", async () => {
    const { helpers } = fakeHelpers();
    const response = await authorize(page(), deps(helpers, memberState(), null));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "", origin);
    expect(location.pathname).toBe("/api/auth/google/start");
    expect(location.searchParams.get("next")).toBe(
      "/authorize?client_id=client-1&response_type=code",
    );
  });

  it("an approval sent after signing out asks the person to sign in again", async () => {
    const { helpers, completed } = fakeHelpers();
    const response = await authorize(
      post({ action: "allow", handle: "handle-1", account: identity.email }),
      deps(helpers, memberState(), null),
    );
    expect(response.status).toBe(401);
    expect(await response.text()).toContain("Signed out");
    expect(completed).toHaveLength(0);
  });

  it("someone with no Slice profile is treated like a pending member", async () => {
    const { helpers } = fakeHelpers();
    const response = await authorize(page(), deps(helpers, emptyState(null)));
    expect(response.status).toBe(403);
  });

  it("active member sees the approval page", async () => {
    const { helpers } = fakeHelpers();
    const response = await authorize(page(), deps(helpers));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Claude");
    expect(body).toContain("the name this app gave itself");
    expect(body).toContain("client.example");
    expect(body).toContain("consent@example.test");
    expect(body).toContain("This app will be able to use Slice as you, with your current access.");
    expect(body).toContain('value="allow"');
    expect(body).toContain('value="cancel"');
    expect(response.headers.get("set-cookie")).toContain("__Host-oauth-consent");
  });

  it("marks loopback return addresses as an app on this computer", async () => {
    const { helpers } = fakeHelpers({
      redirectUri: "http://127.0.0.1:5555/cb",
      redirectHost: "127.0.0.1",
      redirectIsLoopback: true,
    });
    expect(await (await authorize(page(), deps(helpers))).text()).toContain(
      "(an app on this computer)",
    );
  });

  it("page headers lock the page down", async () => {
    const { helpers } = fakeHelpers();
    const response = await authorize(page(), deps(helpers));
    expect(response.headers.get("content-security-policy")).toContain(
      "form-action 'self' https://client.example",
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
  });

  it("hostile name is escaped and truncated", async () => {
    const hostile = `<script>alert(1)</script>${"x".repeat(200)}`;
    const { helpers } = fakeHelpers({ clientName: hostile });
    const body = await (await authorize(page(), deps(helpers))).text();
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;");
    expect(body).not.toContain("x".repeat(81));
  });

  it("an app that gave no name is shown as Unnamed app", async () => {
    const { helpers } = fakeHelpers({ clientName: "client-1" });
    expect(await (await authorize(page(), deps(helpers))).text()).toContain("Unnamed app");
  });

  it("Allow completes authorization for the signed-in member", async () => {
    const { helpers, completed } = fakeHelpers();
    const response = await authorize(
      post({ action: "allow", handle: "handle-1", account: identity.email }),
      deps(helpers),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://client.example/cb?code=abc&state=state-1",
    );
    expect(completed).toHaveLength(1);
    expect(completed[0].userId).toBe(await grantUserId(identity.subject));
    expect(completed[0].scope).toEqual(["slice"]);
    expect(completed[0].props).toEqual({ ...identity, clientId: "client-1" });
    expect(completed[0].metadata).toEqual({ clientName: "Claude" });
  });

  it("Cancel denies", async () => {
    const { helpers, completed } = fakeHelpers();
    const response = await authorize(
      post({ action: "cancel", handle: "handle-1", account: identity.email }),
      deps(helpers),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=access_denied");
    expect(completed).toHaveLength(0);
  });

  it("cross-site POST is refused", async () => {
    const { helpers, completed } = fakeHelpers();
    const response = await authorize(
      post(
        { action: "allow", handle: "handle-1", account: identity.email },
        { Origin: "https://evil.example" },
      ),
      deps(helpers),
    );
    expect(response.status).toBe(403);
    expect(completed).toHaveLength(0);
  });

  it("a reused approval shows Approval expired and grants nothing more", async () => {
    const { helpers, completed } = fakeHelpers();
    const fields = { action: "allow", handle: "handle-1", account: identity.email };
    await authorize(post(fields), deps(helpers));
    const replay = await authorize(post(fields), deps(helpers));
    expect(replay.status).toBe(400);
    expect(await replay.text()).toContain("Approval expired");
    expect(completed).toHaveLength(1);
  });

  it("an approval for a different account than the signed-in one shows Approval expired", async () => {
    const { helpers, completed } = fakeHelpers();
    const response = await authorize(
      post({ action: "allow", handle: "handle-1", account: "other@example.test" }),
      deps(helpers),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Approval expired");
    expect(completed).toHaveLength(0);
  });

  it("an approval from a member suspended since the page opened is refused", async () => {
    const { helpers, completed } = fakeHelpers();
    const response = await authorize(
      post({ action: "allow", handle: "handle-1", account: identity.email }),
      deps(helpers, memberState("suspended")),
    );
    expect(response.status).toBe(403);
    expect(completed).toHaveLength(0);
  });
});
