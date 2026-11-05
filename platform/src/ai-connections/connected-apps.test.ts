import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectedAppsView, disconnectConnection, loadConnections } from "./connected-apps";
import type { ConnectionsResponse } from "./contracts";

const response: ConnectionsResponse = {
  enabled: true,
  connections: [
    {
      id: "grant-1",
      name: "Claude",
      connectedAt: "2026-11-01T09:00:00.000Z",
      lastUsedAt: "2026-11-05T11:55:00.000Z",
      lapsesAt: "2026-12-05T11:00:00.000Z",
    },
    {
      id: "grant-2",
      name: "<img src=x onerror=alert(1)>",
      connectedAt: "2026-11-02T09:00:00.000Z",
      lastUsedAt: null,
      lapsesAt: "2026-12-02T09:00:00.000Z",
    },
  ],
};

const render = (props: Partial<Parameters<typeof ConnectedAppsView>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ConnectedAppsView, {
      response,
      busy: false,
      error: null,
      timeZone: "UTC",
      onDisconnect: () => {},
      ...props,
    }),
  );

describe("ConnectedAppsView", () => {
  it("lists apps with connected, last used and lapse dates", () => {
    const html = render();
    expect(html).toContain('id="connected-apps"');
    expect(html).toContain("Connected apps");
    expect(html).toContain("Claude");
    expect(html).toContain("Nov 1, 2026");
    expect(html).toContain("Nov 5, 2026");
    expect(html).toContain("Dec 5, 2026");
    expect(html).toContain("Never");
    expect(html).toContain("Disconnect");
  });

  it("shows the exact explanation copy", () => {
    expect(render()).toContain(
      "Apps you allowed through sign-in. They act as you, with your current access. Disconnecting one stops it at once.",
    );
  });

  it("empty state links to Connect your AI", () => {
    const html = render({ response: { enabled: true, connections: [] } });
    expect(html).toContain("No connected apps.");
    expect(html).toContain('href="/connect-ai"');
  });

  it("escapes a hostile name", () => {
    const html = render();
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("names each Disconnect button for screen readers", () => {
    expect(render()).toContain('aria-label="Disconnect Claude"');
  });

  it("is hidden while disabled or unavailable", () => {
    expect(render({ response: null })).toBe("");
    expect(render({ response: { ...response, enabled: false } })).toBe("");
  });

  it("shows an error message when one is given", () => {
    expect(render({ error: "That connection was not found." })).toContain(
      "That connection was not found.",
    );
  });
});

describe("disconnectConnection", () => {
  it("asks for confirmation, then sends DELETE", async () => {
    const asked: string[] = [];
    const sent: [string, RequestInit | undefined][] = [];
    const done = await disconnectConnection("grant-1", "Claude", {
      confirm: (text) => {
        asked.push(text);
        return true;
      },
      fetch: async (input, init) => {
        sent.push([input, init]);
        return new Response(null, { status: 204 });
      },
    });
    expect(done).toBe(true);
    expect(asked).toEqual(["Disconnect Claude? It stops working at once."]);
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toBe("/api/membership/connections/grant-1");
    expect(sent[0][1]?.method).toBe("DELETE");
  });

  it("does nothing when the person cancels", async () => {
    let called = false;
    const done = await disconnectConnection("grant-1", "Claude", {
      confirm: () => false,
      fetch: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    });
    expect(done).toBe(false);
    expect(called).toBe(false);
  });

  it("reports the server's reason when it refuses", async () => {
    await expect(
      disconnectConnection("grant-9", "Claude", {
        confirm: () => true,
        fetch: async () =>
          Response.json({ error: "That connection was not found." }, { status: 404 }),
      }),
    ).rejects.toThrow("That connection was not found.");
  });

  it("encodes the grant ID in the address", async () => {
    let address = "";
    await disconnectConnection("a/b?c", "Claude", {
      confirm: () => true,
      fetch: async (input) => {
        address = input;
        return new Response(null, { status: 204 });
      },
    });
    expect(address).toBe("/api/membership/connections/a%2Fb%3Fc");
  });
});

describe("loadConnections", () => {
  it("returns null when the request fails or is refused", async () => {
    expect(await loadConnections(async () => new Response(null, { status: 403 }))).toBeNull();
    expect(
      await loadConnections(async () => {
        throw new TypeError("offline");
      }),
    ).toBeNull();
  });

  it("returns the response when it is well formed", async () => {
    expect(await loadConnections(async () => Response.json(response))).toEqual(response);
  });
});
