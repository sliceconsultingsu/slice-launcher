import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppCard, AppIcon } from "@slice/ui";
import { getAppUrl, getAboutUrl } from "./apps";

const entry = {
  id: "alumni",
  name: "Alumni Database",
  description: "Browse approved alumni records",
};

describe("app links", () => {
  it("use the platform origin, shared app route and app page route", () => {
    expect(getAppUrl(entry)).toBe("/apps/alumni");
    expect(getAboutUrl(entry)).toBe("/about/alumni");
  });
  it.each(["../account", "https://external.test", "alumni/other", "", "constructor?"])(
    "rejects invalid ID %s",
    (id) => {
      expect(() => getAppUrl({ id })).toThrow("Invalid application ID");
      expect(() => getAboutUrl({ id })).toThrow("Invalid application ID");
    },
  );
});

const card = {
  name: entry.name,
  description: entry.description,
  icon: "/app-icons/alumni.svg?v=0123456789ab",
  detailsHref: "/about/alumni",
};

describe("AppCard", () => {
  it("shows the icon, name, description and named Open and Details actions", () => {
    const html = renderToStaticMarkup(createElement(AppCard, { ...card, href: "/apps/alumni" }));
    expect(html).toContain('src="/app-icons/alumni.svg?v=0123456789ab"');
    expect(html).toMatch(/<img[^>]*alt=""/);
    expect(html).toContain("<h2");
    expect(html).toContain("Browse approved alumni records");
    expect(html).toMatch(
      /href="\/apps\/alumni"[^>]*>Open<span class="sr-only"> Alumni Database<\/span>/,
    );
    expect(html).toMatch(
      /href="\/about\/alumni"[^>]*>Details<span class="sr-only"> for Alumni Database<\/span>/,
    );
  });

  it("keeps the details link but shows Coming soon instead of Open when an app has no link", () => {
    const html = renderToStaticMarkup(createElement(AppCard, { ...card, href: null }));
    expect(html).not.toContain('href="/apps/alumni"');
    expect(html).toContain("Coming soon");
    expect(html).toContain('href="/about/alumni"');
  });

  it("says an app is private only when told it is", () => {
    const open = renderToStaticMarkup(createElement(AppCard, { ...card, href: "/apps/alumni" }));
    expect(open).not.toContain("Private");
    const html = renderToStaticMarkup(
      createElement(AppCard, { ...card, href: "/apps/alumni", isPrivate: true }),
    );
    expect(html).toContain("Private");
  });

  it("labels work-in-progress apps without changing their actions", () => {
    const plain = renderToStaticMarkup(createElement(AppCard, { ...card, href: "/apps/alumni" }));
    expect(plain).not.toContain("Work in progress");
    const html = renderToStaticMarkup(
      createElement(AppCard, { ...card, href: "/apps/alumni", workInProgress: true }),
    );
    expect(html).toContain("Work in progress");
    expect(html).toMatch(/href="\/apps\/alumni"[^>]*>Open/);
    expect(html).toContain('href="/about/alumni"');
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
