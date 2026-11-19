import catalog from "../platform/catalog.generated.json";
import type { AppDescriptor } from "../platform/contracts";

/** Catalog entry plus the icon path that `pnpm apps:sync` publishes. */
export interface LauncherApp extends AppDescriptor {
  icon: string;
}

export const apps: readonly LauncherApp[] = catalog;

const idPattern = /^[a-z][a-z0-9-]{0,39}$/;

export function getAppUrl(app: Pick<AppDescriptor, "id">): string {
  if (!idPattern.test(app.id)) throw new Error("Invalid application ID");
  return `/apps/${app.id}`;
}

/** The app's own page: its guide for everyone who can open it, its settings for who runs it. */
export function getAboutUrl(app: Pick<AppDescriptor, "id">): string {
  if (!idPattern.test(app.id)) throw new Error("Invalid application ID");
  return `/about/${app.id}`;
}
