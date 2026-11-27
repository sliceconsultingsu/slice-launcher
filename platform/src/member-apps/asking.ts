// What an app's server code is told about who is asking. It comes from the launcher on every
// request and never from the browser or the AI: the same four headers whether a page called the
// app or a member's AI called one of its tools.
import type { Member } from "../membership/contracts";

/**
 * Removes anything that could pass for an identity or a credential, then says who is asking.
 * `permissions` are the member's full permission IDs, such as "app.notes.edit".
 */
export function setAsking(
  headers: Headers,
  appId: string,
  member: Pick<Member, "id" | "name">,
  runs: boolean,
  permissions: readonly string[],
): Headers {
  for (const name of [...headers.keys()])
    if (
      name === "cookie" ||
      name === "authorization" ||
      name.startsWith("x-slice-") ||
      name.startsWith("cf-access-")
    )
      headers.delete(name);
  const prefix = `app.${appId}.`;
  headers.set("X-Slice-Member-Id", member.id);
  headers.set("X-Slice-Member-Name", encodeURIComponent(member.name));
  headers.set("X-Slice-Manager", String(runs));
  headers.set(
    "X-Slice-Powers",
    permissions
      .filter((p) => p.startsWith(prefix) && p !== `${prefix}open`)
      .map((p) => p.slice(prefix.length))
      .join(","),
  );
  return headers;
}
