import guides from "../platform/guides.generated.json";
import { apps, type LauncherApp } from "./apps";

/** Public consultant guide for a catalog app, or null when the ID is unknown. */
export function findGuide(id: string): { app: LauncherApp; markdown: string } | null {
  const app = apps.find((entry) => entry.id === id);
  const markdown = app ? (guides as Record<string, string>)[app.id] : undefined;
  return app && typeof markdown === "string" ? { app, markdown } : null;
}
