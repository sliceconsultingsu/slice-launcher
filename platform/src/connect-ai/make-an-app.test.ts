import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MakeAnAppCard, makeAnAppPrompt } from "./make-an-app";

describe("the Make an app card", () => {
  it("gives the member one message that sends their AI to the guide first", () => {
    expect(makeAnAppPrompt).toContain("slice_app_guide");
    expect(makeAnAppPrompt).toContain("preview");
    expect(makeAnAppPrompt).toContain("what problem");
  });

  it("is shown only while member apps are switched on", () => {
    const on = renderToStaticMarkup(createElement(MakeAnAppCard, { show: true }));
    expect(on).toContain("Make an app");
    expect(on).toContain("Copy the message");
    expect(on).toContain("private to you");
    expect(renderToStaticMarkup(createElement(MakeAnAppCard, { show: false }))).toBe("");
  });
});
