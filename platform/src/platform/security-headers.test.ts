import { describe, expect, it } from "vitest";
import { PAGE_POLICY, withSecurityHeaders } from "./security-headers";

const html = (headers: Record<string, string> = {}) =>
  new Response("<p>page</p>", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });

describe("withSecurityHeaders", () => {
  it("gives a page a policy that forbids framing and outside sources", async () => {
    const response = withSecurityHeaders(html());
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    expect(policy).toBe(PAGE_POLICY);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("<p>page</p>");
  });

  it("keeps a stricter policy that a route set itself", () => {
    const own = "default-src 'none'; frame-ancestors 'none'";
    const response = withSecurityHeaders(
      html({ "Content-Security-Policy": own, "Referrer-Policy": "no-referrer" }),
    );
    expect(response.headers.get("Content-Security-Policy")).toBe(own);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("gives an API response transport and sniffing protection but no page policy", () => {
    const response = withSecurityHeaders(Response.json({ ok: true }, { status: 401 }));
    expect(response.status).toBe(401);
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("X-Frame-Options")).toBeNull();
  });

  it("keeps redirects and their cookies intact", () => {
    const headers = new Headers({ Location: "/account" });
    headers.append("Set-Cookie", "a=1; Path=/");
    headers.append("Set-Cookie", "b=2; Path=/");
    const response = withSecurityHeaders(new Response(null, { status: 303, headers }));
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/account");
    expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });
});
