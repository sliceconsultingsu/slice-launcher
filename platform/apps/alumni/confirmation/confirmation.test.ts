import { describe, expect, it } from "vitest";
import { alumniApi } from "../api";
import { count, useAlumniData } from "../tests/database";
import { apiAs, type TestMember } from "../tests/members";
import type { Mailer, OutgoingEmail } from "./mail";
import { confirmationMessage } from "./message";
import { CONFIRM_INTERVAL_DAYS, SEND_BATCH_MAX } from "./config";

const t = useAlumniData();
const ADMIN: TestMember = "member-example-admin";
let outbox: OutgoingEmail[] = [];
/** Recipients the stand-in mail service refuses, by error code. */
let refuse: Record<string, string> = {};
let mailer: Mailer | null = null;
const standIn = (): Mailer => ({
  from: "alumni@example.com",
  sender: {
    async send(message) {
      const code = refuse[message.to] ?? refuse["*"];
      if (code) throw Object.assign(new Error("refused"), { code });
      outbox.push(message);
      return { messageId: `message-${outbox.length}` };
    },
  },
});
const api = (member: TestMember, method: string, path: string, body?: unknown) =>
  apiAs((props) =>
    alumniApi(
      props,
      () => t.data,
      () => mailer,
    ),
  )(member, method, path, body);
const reset = () => {
  outbox = [];
  refuse = {};
  mailer = standIn();
};
const sendAll = async () => {
  const totals = { sent: 0, failed: 0 };
  for (let round = 0; round < 10; round++) {
    const { body } = await api(ADMIN, "POST", "confirmations/send", {});
    const result = body as {
      sent: number;
      failed: number;
      remaining: number;
      stopped: string | null;
    };
    totals.sent += result.sent;
    totals.failed += result.failed;
    if (result.remaining === 0 || result.stopped) return { ...totals, last: result };
  }
  throw new Error("sending did not finish");
};
type Status = {
  ready: boolean;
  people: {
    personId: string;
    hasEmail: boolean;
    due: boolean;
    askedAt: string | null;
    answeredAt: string | null;
  }[];
  example: { subject: string; text: string };
};
const status = async () => (await api(ADMIN, "GET", "confirmations")).body as Status;

describe("the confirmation email's wording", () => {
  it("says what is on file, asks for a reply and offers a way out, with no contact details", () => {
    const message = confirmationMessage({
      fullName: "Dana Whitcombe",
      graduationYear: 2019,
      job: { title: "Associate", employer: "Juniper Row <Partners>" },
      adminName: "Avery Admin",
    });
    expect(message.subject).toBe(
      "Slice Consulting alumni directory: are your details still right?",
    );
    expect(message.text).toContain("Hi Dana,");
    expect(message.text).toContain("Associate at Juniper Row <Partners>\nClass of 2019");
    expect(message.text).toContain("reply to this email");
    expect(message.text).toContain("If you would rather not be listed");
    expect(message.text).toContain("Avery Admin");
    expect(message.text).not.toMatch(/@|https?:/);
    expect(message.html).toContain("Juniper Row &lt;Partners&gt;");
    expect(message.html).not.toContain("<Partners>");
    expect(
      confirmationMessage({
        ...{ fullName: "Eli Marsh", graduationYear: 2012, adminName: "" },
        job: null,
      }).text,
    ).toContain("No current job on record");
  });
});

describe("sending confirmation emails", () => {
  it("emails each listed alum with an address once, from Slice, with replies to the admin", async () => {
    reset();
    const before = await status();
    expect(before.ready).toBe(true);
    expect(before.example.text).toContain("Hi Alex,");
    const due = before.people.filter((person) => person.due);
    // The seed has 11 listed alumni with an email on file; the others cannot be asked this way.
    expect(due).toHaveLength(11);
    expect(before.people.filter((person) => !person.hasEmail)).toHaveLength(17);
    const totals = await sendAll();
    expect(totals).toMatchObject({ sent: 11, failed: 0 });
    expect(outbox).toHaveLength(11);
    expect(new Set(outbox.map((message) => message.to)).size).toBe(11);
    for (const message of outbox) {
      expect(message.to).toMatch(/@example\.com$/);
      expect(message.from).toEqual({ email: "alumni@example.com", name: "Slice Consulting" });
      expect(message.replyTo).toBe("member-example-admin@example.test");
      expect(message.text).toContain("Avery Admin");
    }
    const jordan = outbox.find((message) => message.to === "jordan.avery15@example.com");
    expect(jordan?.text).toContain("Hi Jordan,");
    expect(jordan?.text).toContain("Associate at Harbor & Pine Capital\nClass of 2015");
    // One alum's email never names another alum.
    expect(jordan?.text).not.toContain("Marcus");
    expect(
      await count(
        t.db,
        "alumni_confirmation_requests WHERE outcome = 'sent' AND message_id IS NOT NULL",
      ),
    ).toBe(11);
  });

  it("sends a few at a time and says how many are left", async () => {
    reset();
    const first = (await api(ADMIN, "POST", "confirmations/send", {})).body;
    expect(first).toEqual({ sent: SEND_BATCH_MAX, failed: 0, remaining: 1, stopped: null });
    expect((await api(ADMIN, "POST", "confirmations/send", { limit: 50 })).status).toBe(400);
    expect((await api(ADMIN, "POST", "confirmations/send", { limit: 1 })).body).toMatchObject({
      sent: 1,
      remaining: 0,
    });
  });

  it("asks nobody twice until a year has passed, even when two admins press send together", async () => {
    reset();
    const both = await Promise.all([sendAll(), sendAll()]);
    expect(both[0].sent + both[1].sent).toBe(11);
    expect(outbox).toHaveLength(11);
    expect((await sendAll()).sent).toBe(0);
    t.advance((CONFIRM_INTERVAL_DAYS - 1) * 86_400);
    expect((await status()).people.filter((person) => person.due)).toHaveLength(0);
    t.advance(2 * 86_400);
    expect((await status()).people.filter((person) => person.due)).toHaveLength(11);
  });

  it("never emails a hidden alum, a merged record or an address from the request", async () => {
    reset();
    await t.db
      .prepare(
        "INSERT INTO alumni_contacts(id, person_id, kind, value, value_key, created_at, updated_at) VALUES ('c-h', 'p-a18', 'email', 'theo@example.com', 'theo@example.com', ?, ?), ('c-m', 'p-a28', 'email', 'patrick@example.com', 'patrick@example.com', ?, ?)",
      )
      .bind(t.now, t.now, t.now, t.now)
      .run();
    expect(
      (await api(ADMIN, "POST", "confirmations/send", { to: "someone.else@example.com" })).status,
    ).toBe(400);
    await sendAll();
    const recipients = outbox.map((message) => message.to);
    expect(recipients).not.toContain("theo@example.com");
    expect(recipients).not.toContain("patrick@example.com");
    expect(recipients).not.toContain("someone.else@example.com");
  });

  it("logs a refused recipient, carries on, and tries them again a day later", async () => {
    reset();
    refuse = { "jordan.avery15@example.com": "E_RECIPIENT_SUPPRESSED" };
    expect(await sendAll()).toMatchObject({ sent: 10, failed: 1 });
    expect(
      await t.db
        .prepare(
          "SELECT outcome, detail, message_id FROM alumni_confirmation_requests WHERE person_id = 'p-a01'",
        )
        .first(),
    ).toEqual({ outcome: "failed", detail: "E_RECIPIENT_SUPPRESSED", message_id: null });
    refuse = {};
    expect((await sendAll()).sent).toBe(0);
    t.advance(25 * 3600);
    expect((await sendAll()).sent).toBe(1);
    expect(outbox.at(-1)?.to).toBe("jordan.avery15@example.com");
  });

  it("stops at once when the mail service is not set up, and logs nothing against anyone", async () => {
    reset();
    refuse = { "*": "E_SENDER_NOT_VERIFIED" };
    const result = (await api(ADMIN, "POST", "confirmations/send", {})).body;
    expect(result).toEqual({
      sent: 0,
      failed: 0,
      remaining: 11,
      stopped: "The sending address is not set up with the mail service yet.",
    });
    expect(await count(t.db, "alumni_confirmation_requests")).toBe(0);
    refuse = {};
    mailer = {
      from: "alumni@example.com",
      sender: {
        async send() {
          throw new Error("network down");
        },
      },
    };
    expect((await api(ADMIN, "POST", "confirmations/send", {})).body).toMatchObject({
      sent: 0,
      stopped: expect.stringContaining("unexpected error"),
    });
    expect(await count(t.db, "alumni_confirmation_requests")).toBe(0);
  });

  it("sends nothing while email is not set up", async () => {
    reset();
    mailer = null;
    expect((await status()).ready).toBe(false);
    const response = await api(ADMIN, "POST", "confirmations/send", {});
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: expect.stringContaining("not set up yet") });
    expect(await count(t.db, "alumni_confirmation_requests")).toBe(0);
  });

  it.each([
    "member-example-01",
    "member-example-runner",
    "member-example-opener",
    "member-example-suspended",
  ] as const)("refuses %s, who is not an admin or is suspended", async (member) => {
    reset();
    expect((await api(member, "GET", "confirmations")).status).toBe(403);
    expect((await api(member, "POST", "confirmations/send", {})).status).toBe(403);
    expect((await api(member, "GET", "alumni/p-a09/reply")).status).toBe(403);
    expect((await api(member, "POST", "alumni/p-a09/reply", { listed: false })).status).toBe(403);
    expect(outbox).toHaveLength(0);
    expect((await t.data.reads.getAlum({ memberId: "x", admin: false }, "p-a09"))?.name).toBe(
      "Marcus Bellweather",
    );
  });
});

describe("recording an alum's reply", () => {
  const member = { memberId: "member-example-01", admin: false };
  const form = async (id: string) =>
    ((await api(ADMIN, "GET", `alumni/${id}/reply`)).body as { form: Record<string, unknown> })
      .form;

  it("starts from what is on file, including details hidden from members", async () => {
    expect(await form("p-a09")).toMatchObject({
      name: "Marcus Bellweather",
      employer: "Quarry Street Consulting",
      title: "Senior Consultant",
      industryId: "consulting",
      listed: true,
      contacts: [
        { id: "c-10", kind: "email", value: "marcus.b@example.com", shared: true },
        { id: "c-11", kind: "phone", value: "+1 315-555-0142", shared: false },
      ],
    });
    expect((await api(ADMIN, "GET", "alumni/p-a28/reply")).status).toBe(404);
  });

  it("applies a new job, shared details, help offered and the date they agreed", async () => {
    reset();
    await sendAll();
    t.advance(3 * 86_400);
    const saved = await api(ADMIN, "POST", "alumni/p-a09/reply", {
      employer: "Juniper Row Partners",
      title: "Principal",
      industryId: "consulting",
      contacts: [
        { id: "c-10", share: false },
        { id: "c-11", share: true },
      ],
      newContacts: [{ kind: "email", value: "marcus.personal@example.com" }],
      helpKindIds: ["career-advice", "introductions"],
      note: "Happy to take calls on Fridays.",
    });
    expect(saved).toEqual({ status: 200, body: { status: "saved" } });
    const profile = await t.data.reads.getAlum(member, "p-a09");
    expect(profile).toMatchObject({
      employer: "Juniper Row Partners",
      title: "Principal",
      helpOffered: ["Career advice", "Introductions"],
      note: "Happy to take calls on Fridays.",
      lastCheckedAt: t.now,
    });
    expect(profile?.pastJobs[0]).toMatchObject({ employer: "Quarry Street Consulting" });
    // The work email is now hidden; the phone and the new personal email are shared.
    expect(profile?.contacts.map((contact) => contact.value).sort()).toEqual([
      "+1 315-555-0142",
      "marcus.personal@example.com",
    ]);
    expect(
      (
        await t.db
          .prepare(
            "SELECT id, consent_at FROM alumni_contacts WHERE person_id = 'p-a09' AND visibility = 'members' ORDER BY kind",
          )
          .all<{ consent_at: string | null }>()
      ).results.every((row: { consent_at: string | null }) => row.consent_at === t.now),
    ).toBe(true);
    expect((await status()).people.find((person) => person.personId === "p-a09")).toMatchObject({
      answeredAt: t.now,
      due: false,
    });
    expect(
      await count(t.db, "alumni_change_history WHERE record_id = 'p-a09' AND field = 'confirmed'"),
    ).toBe(1);
  });

  it("treats a new title at the same employer as a correction, and no job fields as no change", async () => {
    await api(ADMIN, "POST", "alumni/p-a09/reply", {
      employer: "quarry street consulting",
      title: "Engagement Manager",
      industryId: "consulting",
    });
    const corrected = await t.data.reads.getAlum(member, "p-a09");
    expect(corrected).toMatchObject({
      title: "Engagement Manager",
      employer: "Quarry Street Consulting",
    });
    expect(corrected?.pastJobs).toHaveLength(1);
    await api(ADMIN, "POST", "alumni/p-a09/reply", {});
    expect(await t.data.reads.getAlum(member, "p-a09")).toMatchObject({
      title: "Engagement Manager",
    });
  });

  it("takes an alum out of the directory when they ask", async () => {
    expect((await api(ADMIN, "POST", "alumni/p-a09/reply", { listed: false })).status).toBe(200);
    expect(await t.data.reads.getAlum(member, "p-a09")).toBeNull();
    reset();
    await sendAll();
    expect(outbox.map((message) => message.to)).not.toContain("marcus.b@example.com");
  });

  it("refuses a half-entered job, an unknown choice or someone else's contact, and changes nothing", async () => {
    const history = await count(t.db, "alumni_change_history");
    expect(
      (await api(ADMIN, "POST", "alumni/p-a09/reply", { employer: "Juniper Row" })).status,
    ).toBe(400);
    const unknown = await api(ADMIN, "POST", "alumni/p-a09/reply", {
      employer: "Juniper Row",
      title: "Principal",
      industryId: "astrology",
    });
    expect(unknown.body).toMatchObject({ field: "industry" });
    expect(
      (await api(ADMIN, "POST", "alumni/p-a09/reply", { contacts: [{ id: "c-01", share: true }] }))
        .status,
    ).toBe(400);
    expect(
      (
        await api(ADMIN, "POST", "alumni/p-a09/reply", {
          newContacts: [{ kind: "email", value: "not an email" }],
        })
      ).status,
    ).toBe(400);
    expect((await api(ADMIN, "POST", "alumni/nobody/reply", {})).status).toBe(404);
    expect(await count(t.db, "alumni_change_history")).toBe(history);
    expect(await t.data.reads.getAlum(member, "p-a09")).toMatchObject({
      title: "Senior Consultant",
    });
  });
});
