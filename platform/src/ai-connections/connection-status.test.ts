import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectionStatusView, loadConnectionStatus } from "./connection-status";
import type { ConnectionsResponse } from "./contracts";

const now = new Date("2026-11-05T12:00:00Z");
const ok = (body: ConnectionsResponse) => async () => Response.json(body);

describe("loadConnectionStatus", () => {
  it("returns the status for a working response", async () => {
    const view = await loadConnectionStatus(ok({ enabled: true, connections: [] }), () => now);
    expect(view?.label).toBe("Connect your AI");
  });

  it("returns nothing when the request is refused", async () => {
    const refused = async () => Response.json({ error: "no" }, { status: 403 });
    expect(await loadConnectionStatus(refused, () => now)).toBeNull();
  });

  it("returns nothing when the request fails", async () => {
    const failing = async () => {
      throw new TypeError("network down");
    };
    expect(await loadConnectionStatus(failing, () => now)).toBeNull();
  });

  it("gives up after the timeout instead of waiting forever", async () => {
    const hanging = (_input: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    expect(await loadConnectionStatus(hanging, () => now, 20)).toBeNull();
  });

  it("returns nothing for a malformed body", async () => {
    const odd = async () => Response.json({ connections: "nope" });
    expect(await loadConnectionStatus(odd, () => now)).toBeNull();
  });
});

describe("ConnectionStatusView", () => {
  it("renders label, detail and an accessible name, not color alone", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionStatusView, {
        view: {
          kind: "active",
          label: "AI connected",
          detail: "Claude · used 5 min ago",
          href: "/account#connected-apps",
        },
      }),
    );
    expect(html).toContain('href="/account#connected-apps"');
    expect(html).toContain('aria-label="AI connected: Claude · used 5 min ago"');
    expect(html).toContain(">AI connected<");
    expect(html).toContain("Claude · used 5 min ago");
    expect(html).toContain('data-kind="active"');
  });

  it("renders nothing without a view", () => {
    expect(renderToStaticMarkup(createElement(ConnectionStatusView, { view: null }))).toBe("");
  });
});
