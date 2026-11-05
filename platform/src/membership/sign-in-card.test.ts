import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignInCard, signInMessage } from "./sign-in-card";

it("offers Google sign-in for a Syracuse account", () => {
  const html = renderToStaticMarkup(createElement(SignInCard, { error: null }));
  expect(html).toContain("Sign in to Slice");
  expect(html).toContain('href="/api/auth/google/start"');
  expect(html).toContain("Sign in with Google");
  expect(html).toContain("g.syr.edu");
  expect(html).not.toContain('role="alert"');
});

it("explains why a sign-in failed", () => {
  expect(signInMessage("domain")).toBe("Use your Syracuse Google account (g.syr.edu).");
  expect(signInMessage("unverified")).toBe("Google has not verified that email address.");
  expect(signInMessage("rate")).toBe("Too many sign-in attempts. Wait a minute and try again.");
  expect(signInMessage("unavailable")).toBe(
    "Sign-in is not set up yet. Contact the Slice maintainer.",
  );
  for (const code of ["state", "google", "something-else"])
    expect(signInMessage(code)).toBe("Sign-in did not finish. Please try again.");
  const html = renderToStaticMarkup(createElement(SignInCard, { error: "domain" }));
  expect(html).toContain('role="alert"');
  expect(html).toContain("Use your Syracuse Google account (g.syr.edu).");
});
