import { expect, it } from "vitest";
import { emptyState, enroll, effectivePermissions } from "./domain";
import { organizationRole } from "./access-summary";

it("describes bootstrap ownership independently of the Member base level", () => {
  const state = enroll(
    emptyState("owner@example.test"),
    {
      subject: "owner",
      email: "owner@example.test",
    },
    { id: "owner", now: "synthetic" },
  ).state;
  const owner = state.members[0];
  expect(owner.levelId).toBe("member");
  expect(organizationRole(owner, effectivePermissions(state, owner))).toBe("Admin (owner)");
  owner.status = "suspended";
  expect(organizationRole(owner, effectivePermissions(state, owner))).toBe(
    "No organization access",
  );
});

it("describes actual delegated permissions, including revocation, without granting access", () => {
  const state = enroll(
    emptyState(null),
    {
      subject: "member",
      email: "member@example.test",
    },
    { id: "member", now: "synthetic" },
  ).state;
  const member = state.members[0];
  expect(organizationRole(member, [])).toBe("No organization access");
  member.status = "active";
  member.levelId = "member";
  expect(organizationRole(member, effectivePermissions(state, member))).toBe("Member");
  member.allow = ["members.manage", "levels.manage", "audit.read"];
  expect(organizationRole(member, effectivePermissions(state, member))).toBe("Admin");
  member.deny = ["members.manage", "levels.manage"];
  expect(organizationRole(member, effectivePermissions(state, member))).toBe("Activity reviewer");
  member.deny.push("audit.read");
  expect(organizationRole(member, effectivePermissions(state, member))).toBe("Member");
});
