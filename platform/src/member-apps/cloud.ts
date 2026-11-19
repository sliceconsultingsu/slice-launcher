// The launcher's calls to Cloudflare for a member app's server code: one database per app and
// one Worker per publish, in a Workers for Platforms dispatch namespace. The Worker is uploaded
// with exactly one thing attached, the app's own database.
//
// These request shapes follow Cloudflare's documentation. They have not been run against a real
// account (docs/member-apps.md, "What has not been verified").
import { MembershipError } from "../membership/contracts";

export interface AppCloud {
  /** The app's own database, created on first use. Returns Cloudflare's ID for it. */
  ensureDatabase(appId: string): Promise<string>;
  /** Uploads one publish's server code as its own Worker, bound only to the app's database. */
  uploadServer(script: string, code: string, databaseId: string, appId: string): Promise<void>;
}

export type CloudConfig = {
  accountId: string;
  /** A Cloudflare API token limited to Workers scripts and D1 on this account. Never logged. */
  token: string;
  /** The dispatch namespace member apps' Workers live in. */
  namespace: string;
  fetch?: typeof fetch;
};

/** The runtime behaviour an app's Worker gets. Fixed here so every app's code runs the same. */
const COMPATIBILITY_DATE = "2026-10-02";
const scriptName = /^[a-z][a-z0-9-]{2,62}$/;

export function cloudflareApps(config: CloudConfig): AppCloud {
  const send = config.fetch ?? fetch;
  const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}`;
  const authorized = { Authorization: `Bearer ${config.token}` };
  /** The call's result, or null if it failed for any reason. Cloudflare's words stay here. */
  async function call(url: string, init: RequestInit): Promise<unknown | null> {
    try {
      const response = await send(url, init);
      const body = (await response.json()) as { success?: boolean; result?: unknown };
      return response.ok && body.success ? (body.result ?? {}) : null;
    } catch {
      return null;
    }
  }
  return {
    async ensureDatabase(appId) {
      const name = `slice-app-${appId}`;
      const created = (await call(`${base}/d1/database`, {
        method: "POST",
        headers: { ...authorized, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })) as { uuid?: string } | null;
      if (created?.uuid) return created.uuid;
      // Already there from an earlier publish whose save did not go through: use that one.
      const found = (await call(`${base}/d1/database?name=${encodeURIComponent(name)}`, {
        method: "GET",
        headers: authorized,
      })) as { uuid?: string; name?: string }[] | null;
      const existing = Array.isArray(found) ? found.find((item) => item.name === name) : null;
      if (existing?.uuid) return existing.uuid;
      throw new MembershipError(502, "The app's database could not be created.");
    },
    async uploadServer(script, code, databaseId, appId) {
      if (!scriptName.test(script)) throw new Error("Invalid Worker name.");
      const form = new FormData();
      form.set(
        "metadata",
        new File(
          [
            JSON.stringify({
              main_module: "worker.js",
              compatibility_date: COMPATIBILITY_DATE,
              // The only thing an app's code can reach. No secret, service or other database.
              bindings: [{ type: "d1", name: "DB", id: databaseId }],
              tags: [`slice-app:${appId}`],
            }),
          ],
          "metadata.json",
          { type: "application/json" },
        ),
      );
      form.set(
        "worker.js",
        new File([code], "worker.js", { type: "application/javascript+module" }),
      );
      const uploaded = await call(
        `${base}/workers/dispatch/namespaces/${config.namespace}/scripts/${script}`,
        { method: "PUT", headers: authorized, body: form },
      );
      if (uploaded === null)
        throw new MembershipError(
          502,
          "The app's server code could not be uploaded. Check worker.js for errors.",
        );
    },
  };
}
