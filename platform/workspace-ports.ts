import { readFileSync } from "node:fs";

/** Stable distinct ports per prepared workspace; no environment or production configuration. */
export function workspacePort(offset: number, fallback: number): number {
  let port = fallback;
  try {
    const settings: unknown = JSON.parse(
      readFileSync(new URL("../.slice-workspace.json", import.meta.url), "utf8"),
    );
    if (
      !settings ||
      typeof settings !== "object" ||
      !("port" in settings) ||
      typeof settings.port !== "number"
    )
      throw new Error("Invalid workspace settings.");
    port = settings.port + offset;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Workspace port must be between 1024 and 65535.");
  return port;
}
