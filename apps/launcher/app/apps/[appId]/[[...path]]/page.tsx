import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { platform } from "../../../../src/platform/runtime";
import { MembershipError } from "../../../../src/membership/contracts";

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
      if (error.status === 401 || error.status === 403) redirect("/account");
    }
    throw error;
  }
  return (
    <div className="workspace-shell">
      <header className="site-header">
        <a href="/">Slice Consulting</a>
        <a href="/account">My account</a>
      </header>
      <main className="workspace-main">{content}</main>
    </div>
  );
}
