import { describe, expect, it } from "vitest";
import { emptyState, enroll, migrateLegacyIdentity } from "./domain";
import type { Identity, State } from "./contracts";

const legacyIssuer = "https://snowy-voice-36a1.cloudflareaccess.com";
const meta = { id: "audit-1", now: "2026-11-05T12:00:00.000Z" };
const google: Identity = {
  subject: "https://accounts.google.com|1234567890",
  email: "ana@g.syr.edu",
};

function stateWith(subject: string, email = "ana@g.syr.edu"): State {
  const state = enroll(emptyState(null), { subject, email }, { id: "ana", now: "synthetic" }).state;
  state.members[0].status = "active";
  return state;
}

describe("migrateLegacyIdentity", () => {
  it("re-links a member still on their old Access identity, once, with an audit record", () => {
    const before = stateWith(`${legacyIssuer}|access-uuid`);
    const result = migrateLegacyIdentity(before, google, legacyIssuer, meta);
    expect(result).not.toBeNull();
    expect(result?.state.members[0].subject).toBe(google.subject);
    expect(result?.state.revision).toBe(before.revision + 1);
    expect(result?.audit).toMatchObject({
      id: "audit-1",
      action: "member.identity_migrated",
      targetId: "ana",
      before: { subject: `${legacyIssuer}|access-uuid` },
      after: { subject: google.subject },
    });
    // The original state is untouched.
    expect(before.members[0].subject).toBe(`${legacyIssuer}|access-uuid`);
  });

  it("matches the email without regard to case", () => {
    const before = stateWith(`${legacyIssuer}|access-uuid`, "Ana@G.Syr.Edu");
    expect(
      migrateLegacyIdentity(before, google, legacyIssuer, meta)?.state.members[0].subject,
    ).toBe(google.subject);
  });

  it("never re-links a member who is already on a Google identity", () => {
    const before = stateWith("https://accounts.google.com|someone-else");
    expect(migrateLegacyIdentity(before, google, legacyIssuer, meta)).toBeNull();
  });

  it("does nothing when nobody has that email", () => {
    const before = stateWith(`${legacyIssuer}|access-uuid`, "other@g.syr.edu");
    expect(migrateLegacyIdentity(before, google, legacyIssuer, meta)).toBeNull();
  });

  it("does nothing when this Google identity is already linked", () => {
    const before = stateWith(google.subject);
    expect(migrateLegacyIdentity(before, google, legacyIssuer, meta)).toBeNull();
  });

  it("does nothing for an invited member who has no identity yet", () => {
    const before = stateWith(`${legacyIssuer}|access-uuid`);
    before.members[0].subject = null;
    expect(migrateLegacyIdentity(before, google, legacyIssuer, meta)).toBeNull();
  });

  it("does not treat a lookalike issuer as the legacy one", () => {
    const before = stateWith(`${legacyIssuer}.evil.example|access-uuid`);
    expect(migrateLegacyIdentity(before, google, legacyIssuer, meta)).toBeNull();
  });
});
