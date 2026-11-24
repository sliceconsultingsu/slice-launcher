// Making a version live describes the app as that version did: its name, description and powers
// come from the version's saved record. The membership rules are pure and cannot read records, so
// the record is read here and handed to them, replacing anything the caller sent.
import type { Repository } from "../membership/repository";

/** The memberapp.live command for this version, described from its saved record. */
export async function liveCommand(repository: Repository, id: string, version: number | null) {
  const record = version === null ? null : await repository.version(id, version);
  return {
    type: "memberapp.live" as const,
    id,
    version,
    ...(record
      ? { as: { name: record.name, description: record.description, powers: record.powers } }
      : {}),
  };
}

/** The same, for a command that arrived from a browser. Anything else is returned untouched. */
export async function describedFromRecord(repository: Repository, command: unknown) {
  if (!command || typeof command !== "object") return command;
  const { type, id, version } = command as { type?: unknown; id?: unknown; version?: unknown };
  if (type !== "memberapp.live" || typeof id !== "string") return command;
  if (
    version !== null &&
    !(typeof version === "number" && Number.isInteger(version) && version > 0)
  )
    return command;
  return liveCommand(repository, id, version);
}
