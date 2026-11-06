"use client";
import { useEffect, useState, type ReactNode } from "react";

export type HomeState = "checking" | "signed-out" | "signed-in";
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Whether to show the front page or the launcher. Only the membership API's 401 means nobody is
 * signed in; anything else keeps the launcher, whose own requests are checked on the server.
 */
export async function loadHomeState(fetcher: Fetch): Promise<Exclude<HomeState, "checking">> {
  try {
    const response = await fetcher("/api/membership", { cache: "no-store", redirect: "error" });
    await response.body?.cancel();
    return response.status === 401 ? "signed-out" : "signed-in";
  } catch {
    return "signed-in";
  }
}

type Views = { checking: ReactNode; signedOut: ReactNode; signedIn: ReactNode };

export function HomeView({ state, checking, signedOut, signedIn }: Views & { state: HomeState }) {
  return <>{state === "checking" ? checking : state === "signed-out" ? signedOut : signedIn}</>;
}

/** Shows the front page to signed-out visitors and the launcher to everyone else. */
export function HomeGate({ checking, signedOut, signedIn }: Views) {
  const [state, setState] = useState<HomeState>("checking");
  useEffect(() => {
    let active = true;
    void loadHomeState((input, init) => fetch(input, init)).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);
  return <HomeView state={state} checking={checking} signedOut={signedOut} signedIn={signedIn} />;
}
