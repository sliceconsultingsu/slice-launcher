"use client";
import { useEffect, useState } from "react";
import { loadView } from "../membership/membership-client";
import { AppGridView, visibleApps, type AppGridState } from "./app-grid-view";
import { apps } from "./apps";

/** Loads what this person can open and shows those tiles. The server enforces access itself. */
export function AppGrid() {
  const [state, setState] = useState<AppGridState>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    loadView()
      .then((view) => {
        if (!active) return;
        setState(
          "needsEnrollment" in view
            ? { kind: "join" }
            : { kind: "ready", apps: visibleApps(apps, view.apps) },
        );
      })
      .catch(() => {
        if (active) setState({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, []);
  return <AppGridView state={state} />;
}
