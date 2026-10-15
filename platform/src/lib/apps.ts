import catalog from "../platform/catalog.generated.json";
import type { AppDescriptor } from "../platform/contracts";

export const apps: readonly AppDescriptor[] = catalog;

export function getAppUrl(app: Pick<AppDescriptor, "id">): string {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(app.id)) throw new Error("Invalid application ID");
  return `/apps/${app.id}`;
}
