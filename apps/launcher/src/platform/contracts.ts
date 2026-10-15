import type { ReactNode } from "react";

export interface AppDescriptor {
  id: string;
  name: string;
  description: string;
  permissions: { id: string; label: string }[];
}

/** Constructed by the platform after verifying identity and current membership. */
export interface AppContext {
  appId: string;
  member: Readonly<{ id: string; name: string; email: string }>;
  permissions: readonly string[];
  /** Checks a declared app permission, e.g. "records.edit". */
  requirePermission(action: string): void;
}
export interface AppPageProps {
  context: AppContext;
  path: string[];
  searchParams: Record<string, string | string[] | undefined>;
}
export interface AppApiProps {
  context: AppContext;
  path: string[];
  searchParams: URLSearchParams;
  method: string;
  /** Platform-validated JSON for mutations; undefined for GET/HEAD. */
  input: unknown;
}
export interface AppModule {
  Page(props: AppPageProps): ReactNode | Promise<ReactNode>;
  api?(props: AppApiProps): Response | Promise<Response>;
}
