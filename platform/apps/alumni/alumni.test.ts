import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPlatform } from "../../src/platform/dispatch";
import type { State } from "../../src/membership/contracts";
import descriptor from "./app.json";
import alumni from "./server";
import { directorySchema } from "./contracts";
import { AlumniApp } from "./ui/app";
import { createSampleRepository, readDirectory } from "./data";
import type { AppContext, AppDescriptor } from "../../src/platform/contracts";
import { descriptor as strict } from "./tests/members";

/**
 * The platform with one learner. `powers` is what the learner was given on the app, or null when
 * they are not on it. By default nothing comes with access, so each action's own check is
 * exercised; pass the real descriptor to test the app as it ships.
 */
function host(powers: string[] | null = ["records.read"], catalog: AppDescriptor = strict) {
  const state: State = {
    revision: 0,
    ownerEmail: null,
    ownerClaimed: true,
    levels: [],
    members: [
      {
        id: "learner",
        subject: "test|learner",
        email: "learner@example.test",
        name: "Learner",
        title: "",
        status: "active",
        levelId: null,
        allow: [],
        deny: [],
        owner: false,
        joinedAt: "2026-10-26",
      },
    ],
    apps: [
      {
        id: "alumni",
        visibility: "private",
        managers: [],
        people: powers ? [{ memberId: "learner", powers }] : [],
      },
    ],
  };
  return createPlatform({
    catalog: [catalog],
    modules: new Map([["alumni", alumni]]),
    verify: async () => ({ subject: "test|learner", email: "learner@example.test" }),
    loadState: async () => state,
  });
}
const request = (suffix = "", method = "GET") =>
  new Request(`https://slice.example/api/apps/alumni/records${suffix}`, {
    method,
    headers: { origin: "https://slice.example", "content-type": "application/json" },
    body: method === "POST" ? "{}" : undefined,
  });
it("loads synthetic alumni and student examples through the guarded API", async () => {
  const response = await host().api(request(), "alumni", ["records"]);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const result = directorySchema.parse(await response.json());
  expect(result.dataset).toBe("synthetic");
  expect(result.alumni.map((record: { id: string }) => record.id)).toEqual([
    "alum-001",
    "alum-002",
    "alum-003",
  ]);
  expect(result.students[0].id).toBe("student-001");
});
it("requires record permission even when the member can open the app", async () => {
  expect((await host([]).api(request(), "alumni", ["records"])).status).toBe(403);
});
it("denies the app to someone who is not on it", async () => {
  expect((await host(null).api(request(), "alumni", ["records"])).status).toBe(403);
});
it("rejects writes instead of pretending to save sample records", async () => {
  expect((await host().api(request("", "POST"), "alumni", ["records"])).status).toBe(405);
});
it("returns a not-found response for unknown operations", async () => {
  expect((await host().api(request(), "alumni", ["unknown"])).status).toBe(404);
});
it("HEAD returns no body", async () => {
  const response = await host().api(request("", "HEAD"), "alumni", ["records"]);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("");
});

it("requires record permission on the page as well as the API", async () => {
  await expect(
    host([]).page(request(), "alumni", { path: [], searchParams: {} }),
  ).rejects.toMatchObject({ status: 403 });
});
it("rejects unexpected fields from storage instead of leaking them to the client", async () => {
  const sample = createSampleRepository();
  const context: AppContext = {
    appId: "alumni",
    member: { id: "learner", name: "Learner", email: "learner@example.test" },
    permissions: ["app.alumni.records.read"],
    requirePermission() {},
  };
  await expect(
    readDirectory(context, {
      ...sample,
      listAlumni: async () =>
        (await sample.listAlumni()).map((record) => ({
          ...record,
          privateContact: "not-for-client@example.test",
        })),
    }),
  ).rejects.toThrow();
});
it("tells consultants the app is a work in progress", () => {
  expect(descriptor.workInProgress).toBe(true);
  const html = renderToStaticMarkup(createElement(AlumniApp, { path: [] }));
  expect(html).toContain("Work in progress");
  expect(html).toContain("Loading the alumni app");
});
it("lets only an admin open the review page", async () => {
  const page = (powers: string[]) =>
    host(powers).page(request(), "alumni", { path: ["review"], searchParams: {} });
  await expect(page(["records.read"])).rejects.toMatchObject({ status: 403 });
  await expect(page(["records.read", "admin"])).resolves.toBeTruthy();
});
it("as shipped, lets anyone on the app browse records but not review changes", async () => {
  const shipped = host([], descriptor);
  expect((await shipped.api(request(), "alumni", ["records"])).status).toBe(200);
  await expect(
    shipped.page(request(), "alumni", { path: ["review"], searchParams: {} }),
  ).rejects.toMatchObject({ status: 403 });
  expect((await host(null, descriptor).api(request(), "alumni", ["records"])).status).toBe(403);
});
