"use client";
// The "Make an app" card on the Connect your AI page (docs/member-apps.md). It is shown only
// while member apps are switched on, which the membership view says.
import { useEffect, useState } from "react";
import { loadView } from "../membership/membership-client";
import { CopyField } from "./copy-field";

export const makeAnAppPrompt = `Help me make an app for Slice Consulting. Call the slice_app_guide tool first and follow it.

Before you build anything, ask me what problem I am trying to solve and who will use the app, one question at a time. Tell me plainly if my idea needs something a Slice app cannot do. Start with the smallest thing that would help, show me a preview to try before you publish it for other people, and tell me how to share it when it is ready.`;

export function MakeAnAppCard({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <section className="connection-boundary" aria-labelledby="make-an-app">
      <h2 id="make-an-app">Make an app</h2>
      <p>
        Once your AI is connected, it can build a small app for you and publish it here. You
        describe the problem; it does the building. A new app is private to you until you share it
        from its page in the launcher.
      </p>
      <CopyField
        id="make-an-app-message"
        label="Message for your AI"
        value={makeAnAppPrompt}
        buttonLabel="Copy the message"
        multiline
      />
      <p className="field-note">
        An app is checked by nobody but you before the people you share it with can use it. Showing
        it to every member needs the Slice owner&apos;s OK.
      </p>
    </section>
  );
}

/** Shows the card to a signed-in member while member apps are on. */
export function MakeAnApp() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let active = true;
    loadView()
      .then((view) => {
        if (active) setShow("appHost" in view && view.appHost !== null);
      })
      .catch(() => {
        // Signed out, or the view could not be loaded: the card simply stays hidden.
      });
    return () => {
      active = false;
    };
  }, []);
  return <MakeAnAppCard show={show} />;
}
