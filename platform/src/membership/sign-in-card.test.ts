import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignInCard, signInMessage } from "./sign-in-card";

it("offers Google sign-in for any Google account", () => {
  const html = renderToStaticMarkup(createElement(SignInCard, { error: null }));
  expect(html).toContain("Sign in to Slice");
  expect(html).toContain('href="/api/auth/google/start"');
  expect(html).toContain("Sign in with Google");
  expect(html).not.toContain("g.syr.edu");
  expect(html).not.toContain('role="alert"');
});

it("explains why a sign-in failed", () => {
  expect(signInMessage("email")).toBe(
    "This Google account can't be matched to your Slice invitation. Sign in with the Google account an administrator invited, or ask them to update it.",
  );
  expect(signInMessage("unverified")).toBe("Google has not verified that email address.");
  expect(signInMessage("rate")).toBe("Too many sign-in attempts. Wait a minute and try again.");
  expect(signInMessage("unavailable")).toBe(
    "Sign-in is not set up yet. Contact the Slice maintainer.",
  );
  for (const code of ["state", "google", "something-else"])
    expect(signInMessage(code)).toBe("Sign-in did not finish. Please try again.");
  const html = renderToStaticMarkup(createElement(SignInCard, { error: "email" }));
  expect(html).toContain('role="alert"');
  expect(html).toContain("can&#x27;t be matched to your Slice invitation");
});
