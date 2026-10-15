import type { ReactNode } from "react";
import type { z } from "zod";

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
/** MCP tools are registered and authorized by the host, never by an app server. */
export interface AppTool {
  name: string;
  description: string;
  /** A declared action in the app catalog; app.open alone never grants tool access. */
  permission: string;
  readOnly: boolean;
  inputSchema: z.ZodObject;
  /** Host-only dispatch: input has already been parsed by the SDK with inputSchema. */
  execute(input: unknown, context: AppContext): Promise<Record<string, unknown>>;
}
export interface AppModule {
  tools?: readonly AppTool[];
  Page(props: AppPageProps): ReactNode | Promise<ReactNode>;
  api?(props: AppApiProps): Response | Promise<Response>;
}
