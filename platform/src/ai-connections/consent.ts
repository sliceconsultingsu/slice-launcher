// The approval page at /authorize. The person's Slice session says who they are (signing in
// with Google first if needed); it shows which AI app is asking and where it returns to, then Allow or
// Cancel. The library's consent handle and binding cookie tie the approval to this browser, once.
import {
  AuthorizationError,
  authorizationErrorRedirect,
  type AuthRequest,
  type ConsentDescription,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import type { Identity, State } from "../membership/contracts";
import { grantUserId, SCOPE, type GrantProps } from "./oauth";

export type ConsentDeps = {
  helpers: OAuthHelpers;
  /** Verifies the Cloudflare Access sign-in on this request. */
  identify: (request: Request) => Promise<Identity>;
  loadState: () => Promise<State>;
};

const NAME_LIMIT = 80;
const MAX_FORM_BYTES = 4096;

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** The app's self-declared name, cut to a readable length. The library falls back to the client ID. */
export function displayName(description: Pick<ConsentDescription, "clientName" | "clientId">) {
  const name = description.clientName.trim();
  if (!name || name === description.clientId) return "Unnamed app";
  return name.length > NAME_LIMIT ? `${name.slice(0, NAME_LIMIT - 1)}…` : name;
}

/** A complete, script-free page in Slice's colors. Every argument is escaped by its caller. */
function page(
  status: number,
  title: string,
  body: string,
  options: { headers?: Headers; returnOrigin?: string } = {},
) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set(
    "Content-Security-Policy",
    // Browsers check form-action against the redirect after the post, so the app's return
    // address must be allowed alongside this page's own.
    `default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'${options.returnOrigin ? ` ${options.returnOrigin}` : ""}`,
  );
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  // Not no-referrer: that makes browsers send "Origin: null" with the form's post.
  headers.set("Referrer-Policy", "same-origin");
  headers.set("Cache-Control", "private, no-store");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Slice</title><style>
:root{color-scheme:light;--ink:#292c30;--muted:#666962;--accent:#a4461c;--accent-hover:#853915;--line:#e5e4df;--surface:#fffefb}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf9f6;color:var(--ink);font:16px/1.5 "Avenir Next",Avenir,"Segoe UI",ui-sans-serif,system-ui,sans-serif}
main{box-sizing:border-box;width:min(460px,calc(100vw - 32px));background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:28px}
.brand{display:block;margin-bottom:20px;font-weight:700;letter-spacing:.02em;color:var(--accent)}
h1{font-size:22px;line-height:1.3;margin:0 0 16px;overflow-wrap:anywhere}p{margin:0 0 12px;color:var(--muted);overflow-wrap:anywhere}strong{color:var(--ink)}
.note{font-size:14px}.actions{display:flex;gap:12px;margin-top:24px}
button,.button{flex:1;box-sizing:border-box;text-align:center;text-decoration:none;font:inherit;font-weight:600;padding:11px 14px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
button:focus-visible,.button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
button[value=allow]{background:var(--accent);border-color:var(--accent);color:#fff}button[value=allow]:hover{background:var(--accent-hover)}
</style></head><body><main><span class="brand">Slice Consulting</span>${body}</main></body></html>`,
    { status, headers },
  );
}

const message = (status: number, title: string, text: string) =>
  page(status, title, `<h1>${escape(title)}</h1><p>${escape(text)}</p>`);
const expired = () =>
  message(
    400,
    "Approval expired",
    "This approval expired or was already used. Start connecting again from your AI app.",
  );

/** The active member behind this Access sign-in, or null when they may not connect apps. */
/** The active member signed in on this browser; "signed-out" without a session; null otherwise. */
async function activeMember(
  request: Request,
  deps: ConsentDeps,
): Promise<Identity | "signed-out" | null> {
  let identity: Identity;
  try {
    identity = await deps.identify(request);
  } catch {
    return "signed-out";
  }
  const member = (await deps.loadState()).members.find((m) => m.subject === identity.subject);
  if (!member || member.email !== identity.email || member.status !== "active") return null;
  return identity;
}

function membershipRequired(authRequest: AuthRequest) {
  const back = authorizationErrorRedirect(
    authRequest,
    "access_denied",
    "An active Slice membership is required.",
  );
  return page(
    403,
    "Membership required",
    `<h1>Membership required</h1>
<p>Only active Slice members can connect AI apps. Check your account, or ask a Slice administrator to approve your membership.</p>
<div class="actions"><a class="button" href="${escape(back)}">Return to your app</a></div>`,
    { returnOrigin: new URL(authRequest.redirectUri).origin },
  );
}

function consentPage(
  description: ConsentDescription,
  account: string,
  handle: string,
  headers: Headers,
) {
  const name = displayName(description);
  const target = new URL(description.redirectUri).origin;
  return page(
    200,
    `Connect ${name} to Slice`,
    `<h1>Connect <strong>${escape(name)}</strong> to Slice</h1>
<p class="note">“${escape(name)}” is the name this app gave itself. Check where it will return to.</p>
<p>It will return to <strong>${escape(description.redirectHost)}</strong>${description.redirectIsLoopback ? " (an app on this computer)" : ""}.</p>
<p>Signed in as <strong>${escape(account)}</strong>.</p>
<p>This app will be able to use Slice as you, with your current access.</p>
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escape(handle)}">
<input type="hidden" name="account" value="${escape(account)}">
<div class="actions"><button type="submit" name="action" value="cancel">Cancel</button><button type="submit" name="action" value="allow">Allow</button></div>
</form>`,
    { headers, returnOrigin: target === "null" ? undefined : target },
  );
}

const redirect = (location: string, headers?: Headers) => {
  const out = new Headers(headers);
  out.set("Location", location);
  out.set("Cache-Control", "private, no-store");
  return new Response(null, { status: 302, headers: out });
};

async function readForm(request: Request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_FORM_BYTES) return null;
  return new URLSearchParams(text);
}

export async function authorize(request: Request, deps: ConsentDeps): Promise<Response> {
  const url = new URL(request.url);
  const { helpers } = deps;
  if (request.method === "GET") {
    let authRequest: AuthRequest;
    try {
      authRequest = await helpers.parseAuthRequest(request);
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo)
        return redirect(error.redirectTo);
      return message(
        400,
        "Cannot connect",
        error instanceof AuthorizationError
          ? error.description
          : "This connection request is not valid. Start connecting again from your AI app.",
      );
    }
    const member = await activeMember(request, deps);
    // Sign in with Google, then come straight back to this approval.
    if (member === "signed-out")
      return redirect(
        `/api/auth/google/start?next=${encodeURIComponent(url.pathname + url.search)}`,
      );
    if (!member) return membershipRequired(authRequest);
    const description = await helpers.describeConsent(authRequest);
    const { handle, headers } = await helpers.beginConsent(authRequest);
    return consentPage(description, member.email, handle, headers);
  }
  if (request.method !== "POST") return message(405, "Not allowed", "Use the approval form.");
  // The binding cookie already ties the handle to this browser; refuse other sites outright too.
  const sentFrom = request.headers.get("Origin");
  if (
    (sentFrom !== null && sentFrom !== url.origin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return message(403, "Not allowed", "Approve connections from the Slice approval page.");
  const form = await readForm(request);
  if (!form) return expired();
  const handle = form.get("handle") ?? "";
  const member = await activeMember(request, deps);
  if (member === "signed-out")
    return message(401, "Signed out", "Sign in to Slice again, then reconnect from your AI app.");
  if (!member)
    return message(
      403,
      "Membership required",
      "Only active Slice members can connect AI apps. Check your account.",
    );
  // Approve only for the account the page named, not one signed in since in another tab.
  if (form.get("account") !== member.email) return expired();
  try {
    if (form.get("action") === "allow") {
      const approved = await helpers.approveConsent(request, handle, { scope: [SCOPE] });
      const description = await helpers.describeConsent(approved.request);
      const props: GrantProps = {
        subject: member.subject,
        email: member.email,
        clientId: approved.request.clientId,
      };
      const { redirectTo } = await helpers.completeAuthorization({
        request: approved.request,
        userId: await grantUserId(member.subject),
        scope: [SCOPE],
        props,
        metadata: { clientName: displayName(description) },
      });
      return redirect(redirectTo, approved.headers);
    }
    const denied = await helpers.denyConsent(request, handle);
    return redirect(denied.redirectTo, denied.headers);
  } catch (error) {
    if (error instanceof AuthorizationError) return expired();
    throw error;
  }
}
