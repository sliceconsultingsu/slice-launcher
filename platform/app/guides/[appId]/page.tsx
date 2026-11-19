import { notFound, permanentRedirect } from "next/navigation";
import { getAboutUrl } from "../../../src/lib/apps";
import { findGuide } from "../../../src/lib/guides";

// An app's guide now lives on the app's own page. Old links keep working.
export default async function GuidePage({ params }: { params: Promise<{ appId: string }> }) {
  const guide = findGuide((await params).appId);
  if (!guide) notFound();
  permanentRedirect(getAboutUrl(guide.app));
}
