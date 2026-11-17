import { MembershipError } from "./contracts";
import type { Audit, Level, Member, Mutation, State } from "./contracts";

type Database = Pick<D1Database, "prepare" | "batch">;
/** How many history entries one page holds. */
export const HISTORY_PAGE = 50;
/** Where a page of history ended: the entry's time and its position in the table. */
export type HistoryCursor = { at: string; position: number };
export class Repository {
  constructor(private db: Database) {}
  async load(): Promise<State> {
    const results = await this.db.batch<Record<string, unknown>>([
      this.db.prepare(
        "SELECT revision, owner_email, owner_claimed FROM organization WHERE id = 'slice'",
      ),
      this.db.prepare("SELECT document FROM members ORDER BY id"),
      this.db.prepare("SELECT document FROM access_levels ORDER BY name"),
    ]);
    const meta = results[0].results[0];
    if (!meta) throw new MembershipError(503, "Membership storage is not configured.");
    return {
      revision: Number(meta.revision),
      ownerEmail: meta.owner_email as string | null,
      ownerClaimed: Boolean(meta.owner_claimed),
      members: results[1].results.map((row) => JSON.parse(String(row.document)) as Member),
      levels: results[2].results.map((row) => JSON.parse(String(row.document)) as Level),
    };
  }
  async commit(before: State, mutation: Mutation): Promise<void> {
    const { state, audit } = mutation;
    const statements = [
      this.db
        .prepare(
          "INSERT INTO mutation_guard (id, permitted) VALUES (?, COALESCE((SELECT revision = ? FROM organization WHERE id = 'slice'), 0))",
        )
        .bind(audit.id, before.revision),
    ];
    for (const level of state.levels) {
      if (JSON.stringify(before.levels.find((l) => l.id === level.id)) === JSON.stringify(level))
        continue;
      statements.push(
        this.db
          .prepare(
            "INSERT INTO access_levels(id, name, document) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, document=excluded.document",
          )
          .bind(level.id, level.name, JSON.stringify(level)),
      );
    }
    for (const member of state.members) {
      if (JSON.stringify(before.members.find((m) => m.id === member.id)) === JSON.stringify(member))
        continue;
      statements.push(
        this.db
          .prepare(
            "INSERT INTO members(id, email, subject, document) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, subject=excluded.subject, document=excluded.document",
          )
          .bind(member.id, member.email, member.subject, JSON.stringify(member)),
      );
    }
    for (const member of state.members) {
      // Someone whose status changes to anything but active (suspended, or returned to pending)
      // is signed out everywhere. Access was already checked on every request; this also stops
      // an old session from coming back to life if they are reinstated. A person who has just
      // joined has no earlier status and keeps the session they joined with.
      if (!member.subject || member.status === "active") continue;
      const was = before.members.find((m) => m.id === member.id);
      if (!was || was.status === member.status) continue;
      statements.push(
        this.db.prepare("DELETE FROM sessions WHERE subject = ?").bind(member.subject),
      );
    }
    for (const member of before.members) {
      if (state.members.some((m) => m.id === member.id)) continue;
      statements.push(this.db.prepare("DELETE FROM members WHERE id = ?").bind(member.id));
      // A removed person is signed out. They can ask to join again like anyone else.
      if (member.subject)
        statements.push(
          this.db.prepare("DELETE FROM sessions WHERE subject = ?").bind(member.subject),
        );
    }
    statements.push(
      this.db
        .prepare("UPDATE organization SET revision = ?, owner_claimed = ? WHERE id = 'slice'")
        .bind(state.revision, state.ownerClaimed ? 1 : 0),
      this.db
        .prepare("INSERT INTO access_audit(id, at, document) VALUES (?, ?, ?)")
        .bind(audit.id, audit.at, JSON.stringify(audit)),
      this.db.prepare("DELETE FROM mutation_guard WHERE id = ?").bind(audit.id),
    );
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (error instanceof Error && /membership_revision_match/.test(error.message))
        throw new MembershipError(409, "Membership changed. Reload and try again.");
      throw error;
    }
  }
  /** The latest entries of every kind, newest first. */
  async history(): Promise<Audit[]> {
    return (await this.historyPage({ includeProfileEdits: true })).items;
  }
  /**
   * One page of access history, newest first. Self-service profile edits are left out unless
   * asked for, so they cannot push administrative changes out of view. `next` continues the list.
   */
  async historyPage(
    options: { includeProfileEdits?: boolean; before?: HistoryCursor } = {},
  ): Promise<{ items: Audit[]; next: HistoryCursor | null }> {
    const where: string[] = [];
    const values: (string | number)[] = [];
    if (options.before) {
      where.push("(at < ? OR (at = ? AND rowid < ?))");
      values.push(options.before.at, options.before.at, options.before.position);
    }
    if (!options.includeProfileEdits)
      where.push("json_extract(document, '$.action') != 'profile.update'");
    const result = await this.db
      .prepare(
        `SELECT rowid AS position, at, document FROM access_audit${
          where.length ? ` WHERE ${where.join(" AND ")}` : ""
        } ORDER BY at DESC, rowid DESC LIMIT ?`,
      )
      .bind(...values, HISTORY_PAGE + 1)
      .all<{ position: number; at: string; document: string }>();
    const rows = result.results.slice(0, HISTORY_PAGE);
    const last = rows.at(-1);
    return {
      items: rows.map((row) => JSON.parse(row.document) as Audit),
      next:
        result.results.length > HISTORY_PAGE && last
          ? { at: last.at, position: last.position }
          : null,
    };
  }
  /** How many times this member has done this action since the given time. */
  async actionsSince(actorId: string, action: string, since: string): Promise<number> {
    const count = await this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM access_audit WHERE at > ? AND json_extract(document, '$.actorId') = ? AND json_extract(document, '$.action') = ?",
      )
      .bind(since, actorId, action)
      .first<number>("count");
    return count ?? 0;
  }
}
