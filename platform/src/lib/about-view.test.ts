import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSettings, AppView, View } from "../membership/contracts";
import { AboutContent, type AboutLoad } from "./about-view";
import type { LauncherApp } from "./apps";

const app: LauncherApp = {
  id: "alumni",
  name: "Alumni directory",
  description: "Find alumni.",
  icon: "/app-icons/alumni.svg?v=0123456789ab",
  workInProgress: true,
  permissions: [
    { id: "records.read", label: "Browse alumni", withAccess: true },
    { id: "admin", label: "Manage alumni data" },
    { id: "refresh.run", label: "Run the refresh" },
  ],
};
const settings: AppSettings = {
  id: "alumni",
  visibility: "private",
  managers: ["max"],
  people: [
    { memberId: "ana", powers: ["admin"] },
    { memberId: "ivy-hidden", powers: [] },
  ],
};
function view(told: Partial<AppView>, status: View["me"]["status"] = "active"): View {
  return {
    revision: 7,
    appHost: null,
    organization: "Slice Consulting",
    me: {
      id: "max",
      email: "max@example.test",
      name: "Max Example",
      title: "",
      status,
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
      joinedAt: "2026-11-18",
      signedIn: true,
    },
    permissions: [],
    members: [
      { id: "ana", name: "Ana Example", title: "", levelName: "Member" },
      { id: "max", name: "Max Example", title: "", levelName: "Member" },
      { id: "sam", name: "Sam Example", title: "", levelName: "Member" },
    ],
    levels: [],
    catalog: [],
    apps: [
      {
        id: "alumni",
        canOpen: true,
        canManage: false,
        visibility: "private",
        managers: ["Max Example"],
        ...told,
      },
    ],
    counts: { active: 3, invited: 1 },
  };
}
const render = (load: AboutLoad) =>
  renderToStaticMarkup(
    createElement(AboutContent, {
      app,
      guide: createElement("p", null, "How to use the alumni directory."),
      load,
      save: () => {},
      reload: () => {},
    }),
  );
const loaded = (told: Partial<AppView>, status?: View["me"]["status"]) =>
  render({ kind: "loaded", view: view(told, status) });

describe("the app page", () => {
  it("offers sign-in to a visitor who is not signed in, and nothing about the app", () => {
    const html = render({ kind: "signed-out" });
    expect(html).toContain("Sign in with Google");
    expect(html).not.toContain("How to use");
    expect(html).not.toContain('href="/apps/alumni"');
  });

  it.each([
    ["has no profile yet", { kind: "loaded", view: { needsEnrollment: true } } as AboutLoad],
    [
      "is pending",
      { kind: "loaded", view: view({ canOpen: false, managers: [] }, "pending") } as AboutLoad,
    ],
  ])("sends someone who %s to their account", (_name, load) => {
    const html = render(load);
    expect(html).toContain("Your Slice membership is not active yet");
    expect(html).toContain('href="/account"');
    expect(html).not.toContain("How to use");
  });

  it("tells a member without access that the app is private and who to ask", () => {
    const html = loaded({ canOpen: false });
    expect(html).toContain("This app is private.");
    expect(html).toContain("Ask Max Example for access.");
    expect(html).not.toContain("How to use");
    expect(html).not.toContain('href="/apps/alumni"');
    expect(html).not.toContain("Manage this app");
  });

  it("names the Slice owner when nobody runs the app", () => {
    expect(loaded({ canOpen: false, managers: [] })).toContain("Ask the Slice owner for access.");
  });

  it("shows a member the guide, who runs the app and the way in, but no settings", () => {
    const html = loaded({});
    expect(html).toContain("Private · Run by Max Example");
    expect(html).toContain("How to use the alumni directory.");
    expect(html).toMatch(/href="\/apps\/alumni"[^>]*>Open/);
    expect(html).toContain("Work in progress");
    expect(html).not.toContain("Manage this app");
    expect(html).not.toContain("Save changes");
  });

  it("shows the people who run the app its settings below the guide", () => {
    const html = loaded({ canManage: true, settings });
    expect(html.indexOf("How to use")).toBeLessThan(html.indexOf("Manage this app"));
    const choice = (value: string) =>
      html.match(/<input[^>]*type="radio"[^>]*>/g)!.find((tag) => tag.includes(`"${value}"`))!;
    expect(choice("private")).toContain("checked");
    expect(choice("public")).not.toContain("checked");
    expect(html).toContain("Every active member of Slice");
    expect(html).toContain("Only the people you add below");
    // Each person, with a tick box for each extra power and none for what comes with access.
    expect(html).toContain("Ana Example");
    expect(html).toContain("Manage alumni data");
    expect(html).toContain("Run the refresh");
    expect(html).not.toContain("Browse alumni");
    // Someone the manager cannot see in the member list is never shown by ID.
    expect(html).toContain("Invited member");
    expect(html).not.toContain("ivy-hidden");
    // Only people not already listed are offered.
    expect(html).toContain("Sam Example");
    expect(html).toContain("Save changes");
    expect(html).not.toContain("@");
  });

  it("says a public app is run by the Slice owner when it has no manager", () => {
    expect(loaded({ visibility: "public", managers: [] })).toContain(
      "Public · Run by the Slice owner",
    );
  });

  it("says so when the page could not be loaded", () => {
    const html = render({ kind: "failed", message: "This page could not be loaded." });
    expect(html).toContain("This page could not be loaded.");
    expect(html).toContain("Try again");
  });
});
