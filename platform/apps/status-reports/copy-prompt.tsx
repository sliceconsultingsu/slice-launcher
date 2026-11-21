"use client";

import { useState } from "react";

/** Shows the prompt and copies it. Nothing is sent anywhere; the PM pastes it themselves. */
export function CopyPrompt({ prompt }: { prompt: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("Copied. Paste it into your AI assistant, then add your notes at the end.");
    } catch {
      setMessage("Copy is unavailable here. Select the text above and copy it manually.");
    }
  }
  return (
    <div className="connection-copy">
      <label htmlFor="status-report-prompt">Prompt for your AI assistant</label>
      <textarea id="status-report-prompt" readOnly value={prompt} rows={20} spellCheck={false} />
      <button type="button" className="secondary-button" onClick={() => void copy()}>
        Copy prompt
      </button>
      <p role="status" className="field-note">
        {message}
      </p>
    </div>
  );
}
