import { headers } from "next/headers";
import { ConnectionStatus } from "../../../../src/ai-connections/connection-status";
import { notFound, redirect } from "next/navigation";
import { platform } from "../../../../src/platform/runtime";
import { MembershipError } from "../../../../src/membership/contracts";
import { getAboutUrl } from "../../../../src/lib/apps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string; path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { appId, path = [] } = await params;
  // Only the signed assertion is trusted; this synthetic URL is not used for writes.
  const request = new Request("https://slice.internal/", { headers: await headers() });
  let content;
  try {
    content = await platform().page(request, appId, { path, searchParams: await searchParams });
  } catch (error) {
    if (error instanceof MembershipError) {
      if (error.status === 404) notFound();
      // An active member who is not on this app is told so, and who to ask, on the app's page.
      if (error.reason === "no-app-access") redirect(getAboutUrl({ id: appId }));
      if (error.status === 401 || error.status === 403) redirect("/account");
    }
    throw error;
  }
  return (
    <div className="workspace-shell">
      <header className="site-header">
        <a href="/">Slice Consulting</a>
        <ConnectionStatus />
        <a href="/account">My account</a>
      </header>
      <main className="workspace-main">{content}</main>
    </div>
  );
}
