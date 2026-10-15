import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppTile } from "@slice/ui";
import { getAppUrl } from "./apps";

const entry = {
  id: "alumni",
  name: "Alumni Database",
  description: "Browse approved alumni records",
};

describe("getAppUrl", () => {
  it("uses the platform origin and shared app route", () => {
    expect(getAppUrl(entry)).toBe("/apps/alumni");
  });
  it.each(["../account", "https://external.test", "alumni/other", "", "constructor?"])(
    "rejects invalid ID %s",
    (id) => {
      expect(() => getAppUrl({ id })).toThrow("Invalid application ID");
    },
  );
});

describe("AppTile", () => {
  it("renders a safe link for an available app", () => {
    const html = renderToStaticMarkup(
      createElement(AppTile, {
        name: entry.name,
        description: entry.description,
        href: "/apps/alumni",
      }),
    );
    expect(html).toContain('href="/apps/alumni"');
    expect(html).toContain("Alumni Database");
  });

  it("shows unavailable text without a link when an app has no URL", () => {
    const html = renderToStaticMarkup(
      createElement(AppTile, {
        name: entry.name,
        description: entry.description,
        href: null,
      }),
    );
    expect(html).not.toMatch(/<a(?:\s|>)/);
    expect(html).toContain("Coming soon");
  });
});
