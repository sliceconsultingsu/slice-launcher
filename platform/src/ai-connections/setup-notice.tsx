"use client";
import { useEffect, useState } from "react";
import { loadConnections } from "./connected-apps";

/** Shown until we know AI connections are switched on, so a slow or failed check stays cautious. */
export function SetupNoticeView({ enabled }: { enabled: boolean | null }) {
  if (enabled) return null;
  return (
    <div className="notice">
      <strong>Awaiting platform setup</strong>
      <p>
        Remote AI sign-in is not ready to use yet. You can check your account and share these
        instructions now. Wait for the Slice maintainer to confirm availability before connecting.
      </p>
    </div>
  );
}

export function SetupNotice() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void loadConnections((input, init) => fetch(input, init)).then((response) => {
      if (active) setEnabled(response?.enabled ?? false);
    });
    return () => {
      active = false;
    };
  }, []);
  return <SetupNoticeView enabled={enabled} />;
}
