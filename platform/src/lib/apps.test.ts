import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppCard, AppIcon } from "@slice/ui";
import { getAppUrl, getGuideUrl } from "./apps";

const entry = {
  id: "alumni",
  name: "Alumni Database",
  description: "Browse approved alumni records",
};

describe("app links", () => {
  it("use the platform origin, shared app route and guide route", () => {
    expect(getAppUrl(entry)).toBe("/apps/alumni");
    expect(getGuideUrl(entry)).toBe("/guides/alumni");
  });
  it.each(["../account", "https://external.test", "alumni/other", "", "constructor?"])(
    "rejects invalid ID %s",
    (id) => {
      expect(() => getAppUrl({ id })).toThrow("Invalid application ID");
      expect(() => getGuideUrl({ id })).toThrow("Invalid application ID");
    },
  );
});

const card = {
  name: entry.name,
  description: entry.description,
  icon: "/app-icons/alumni.svg?v=0123456789ab",
  guideHref: "/guides/alumni",
};

describe("AppCard", () => {
  it("shows the icon, name, description and named Open and Guide actions", () => {
    const html = renderToStaticMarkup(createElement(AppCard, { ...card, href: "/apps/alumni" }));
    expect(html).toContain('src="/app-icons/alumni.svg?v=0123456789ab"');
    expect(html).toMatch(/<img[^>]*alt=""/);
    expect(html).toContain("<h2");
    expect(html).toContain("Browse approved alumni records");
    expect(html).toMatch(
      /href="\/apps\/alumni"[^>]*>Open<span class="sr-only"> Alumni Database<\/span>/,
    );
    expect(html).toMatch(
      /href="\/guides\/alumni"[^>]*>Guide<span class="sr-only"> for Alumni Database<\/span>/,
    );
  });

  it("keeps the guide but shows Coming soon instead of Open when an app has no link", () => {
    const html = renderToStaticMarkup(createElement(AppCard, { ...card, href: null }));
    expect(html).not.toContain('href="/apps/alumni"');
    expect(html).toContain("Coming soon");
    expect(html).toContain('href="/guides/alumni"');
  });

  it("escapes app text instead of rendering it as markup", () => {
    const html = renderToStaticMarkup(
      createElement(AppCard, { ...card, name: "<script>x</script>", href: null }),
    );
    expect(html).not.toContain("<script>");
  });
});

describe("AppIcon", () => {
  it("renders a decorative image at the requested size, never inline SVG", () => {
    const html = renderToStaticMarkup(createElement(AppIcon, { src: card.icon, size: 20 }));
    expect(html).toMatch(/^<img[^>]*width="20"[^>]*height="20"/);
    expect(html).not.toContain("<svg");
  });
});
