import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { findGuide } from "./guides";

describe("findGuide", () => {
  it("returns the alumni guide with its catalog entry", () => {
    const guide = findGuide("alumni");
    expect(guide?.app.name).toBe("Alumni directory");
    expect(guide?.markdown).toMatch(/^# Alumni directory/);
  });
  it.each(["missing", "../alumni", "constructor", "__proto__", ""])("rejects %s", (id) => {
    expect(findGuide(id)).toBeNull();
  });
});

describe("guide rendering", () => {
  // Same options as app/guides/[appId]/page.tsx; CI also rejects raw HTML in guide.md.
  const render = (markdown: string) =>
    renderToStaticMarkup(createElement(Markdown, { skipHtml: true }, markdown));

  it("renders Markdown structure", () => {
    const html = render("# Title\n\n1. **Open** the app\n\n[Docs](https://example.test)");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>Open</strong>");
    expect(html).toContain('href="https://example.test"');
  });
  it("never renders raw HTML or script links", () => {
    const html = render(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))',
    );
    expect(html).not.toMatch(/<script|<img|onerror|javascript:/);
  });
});
