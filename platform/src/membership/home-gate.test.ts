import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeView, loadHomeState } from "./home-gate";

const respond = (status: number) => async () => new Response("{}", { status });

describe("loadHomeState", () => {
  it("shows the front page only when the membership API says nobody is signed in", async () => {
    expect(await loadHomeState(respond(401))).toBe("signed-out");
    for (const status of [200, 403, 500])
      expect(await loadHomeState(respond(status))).toBe("signed-in");
  });

  it("keeps the launcher when the check itself fails", async () => {
    expect(
      await loadHomeState(async () => {
        throw new TypeError("offline");
      }),
    ).toBe("signed-in");
  });
});

describe("HomeView", () => {
  const props = {
    signedOut: createElement("p", null, "front page"),
    signedIn: createElement("p", null, "launcher"),
    checking: createElement("p", null, "checking"),
  };
  it("renders the placeholder while checking, then the matching view", () => {
    expect(renderToStaticMarkup(createElement(HomeView, { ...props, state: "checking" }))).toBe(
      "<p>checking</p>",
    );
    expect(renderToStaticMarkup(createElement(HomeView, { ...props, state: "signed-out" }))).toBe(
      "<p>front page</p>",
    );
    expect(renderToStaticMarkup(createElement(HomeView, { ...props, state: "signed-in" }))).toBe(
      "<p>launcher</p>",
    );
  });
});
