"use client";
import { useEffect, useState } from "react";
import { request } from "./client";

interface Loaded<Body> {
  data: Body | null;
  error: string | null;
  loading: boolean;
}

/** Loads one API route when the screen opens, and again when `path` changes or reload is called. */
export function useLoad<Body>(path: string, method: "GET" | "POST" = "GET") {
  const [state, setState] = useState<Loaded<Body>>({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });
    void request<Body>(path, {
      method,
      body: method === "POST" ? {} : undefined,
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted)
        setState({ data: result.data, error: result.error, loading: false });
    });
    return () => controller.abort();
  }, [path, method, attempt]);
  return {
    ...state,
    reload: () => setAttempt((value) => value + 1),
    /** Replaces the loaded data, for example with the response to a save. */
    replace: (data: Body) => setState({ data, error: null, loading: false }),
  };
}

export function LoadError({ message, retry }: { message: string; retry(): void }) {
  return (
    <div className="al-note al-note-error" role="alert">
      <p>{message}</p>
      <button type="button" className="al-text-btn" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
