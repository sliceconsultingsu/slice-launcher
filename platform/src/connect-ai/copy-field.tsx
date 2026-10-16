"use client";

import { useState } from "react";

export function CopyField({
  id,
  label,
  value,
  buttonLabel,
  multiline = false,
}: {
  id: string;
  label: string;
  value: string;
  buttonLabel: string;
  multiline?: boolean;
}) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied. Paste it into your AI app.");
    } catch {
      setMessage("Copy is unavailable here. Select the text above and copy it manually.");
    }
  }
  return (
    <div className="connection-copy">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} readOnly value={value} rows={7} spellCheck={false} />
      ) : (
        <input id={id} readOnly value={value} spellCheck={false} />
      )}
      <button type="button" className="secondary-button" onClick={() => void copy()}>
        {buttonLabel}
      </button>
      <p role="status" className="field-note">
        {message}
      </p>
    </div>
  );
}
