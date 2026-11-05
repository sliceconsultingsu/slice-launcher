import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SetupNoticeView } from "./setup-notice";

it("shows the awaiting-setup notice until AI connections are switched on", () => {
  for (const enabled of [null, false]) {
    const html = renderToStaticMarkup(createElement(SetupNoticeView, { enabled }));
    expect(html).toContain("Awaiting platform setup");
    expect(html).toContain("Remote AI sign-in is not ready to use yet.");
  }
  expect(renderToStaticMarkup(createElement(SetupNoticeView, { enabled: true }))).toBe("");
});
