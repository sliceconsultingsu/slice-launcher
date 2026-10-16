import { CopyField } from "../../src/connect-ai/copy-field";
import {
  agentGuideUrl,
  agentInstructions,
  connectionAddress,
} from "../../src/connect-ai/instructions";

export default function ConnectAiPage() {
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Slice Consulting home">
          <img
            src="/brand/slice-logo.png"
            alt="Slice Consulting — Syracuse University"
            width="180"
            height="100"
          />
        </a>
        <div className="header-divider" aria-hidden="true" />
        <span className="workspace-label">App Launcher</span>
        <a className="account-link" href="/">
          Applications
        </a>
      </header>
      <main id="main" className="workspace-main connection-guide">
        <p className="eyebrow">Your account. Your permissions.</p>
        <h1>Connect your AI</h1>
        <p className="connection-intro">
          Let your AI help with Slice tools using the access you already have. Your AI can guide you
          through setup; you complete the sign-in.
        </p>
        <div className="notice">
          <strong>Awaiting platform setup</strong>
          <p>
            Remote AI sign-in is not ready to use yet. You can check your account and share these
            instructions now. Wait for the Slice maintainer to confirm availability before
            connecting.
          </p>
        </div>
        <div className="connection-columns">
          <section className="account-card" aria-labelledby="connection-steps">
            <h2 id="connection-steps">How to get connected</h2>
            <ol className="connection-steps">
              <li>
                <h3>Check your Slice account</h3>
                <p>
                  <a href="/account">Open your account</a>, complete your profile if asked, and
                  check that your membership is active. If approval is pending, contact the Slice
                  maintainer.
                </p>
              </li>
              <li>
                <h3>Ask your AI to guide you</h3>
                <p>
                  Copy the instructions on this page into your approved AI app. It should explain
                  where to add a connection and check that your app supports this kind of sign-in.
                </p>
              </li>
              <li>
                <h3>Sign in, then check the connection</h3>
                <p>
                  Once setup is available, follow your AI app’s connection flow. Sign in through
                  Cloudflare with the same Slice account, review the request, and return to your AI
                  app. Ask it to list your available Slice apps.
                </p>
              </li>
            </ol>
            <p className="field-note">
              MCP is the connection that lets an AI use tools provided by an app. Adding this
              address does not give the AI extra permissions.
            </p>
          </section>
          <section className="account-card" aria-labelledby="agent-help">
            <h2 id="agent-help">Give your AI the instructions</h2>
            <p>
              Paste this message into your AI chat. It explains where to go, how to sign in, and how
              to check the result.
            </p>
            <CopyField
              id="agent-instructions"
              label="Message for your AI"
              value={agentInstructions}
              buttonLabel="Copy agent instructions"
              multiline
            />
            <details className="connection-details">
              <summary>Connection address and full guide</summary>
              <CopyField
                id="connection-address"
                label="Slice MCP server address"
                value={connectionAddress}
                buttonLabel="Copy server address"
              />
              <p>
                <a href={agentGuideUrl} target="_blank" rel="noopener noreferrer">
                  Read the full setup guide<span className="sr-only"> (opens in a new tab)</span>
                </a>
                . This public guide can be read before signing in; the launcher stays protected.
              </p>
            </details>
          </section>
        </div>
        <section className="connection-boundary" aria-labelledby="connection-access">
          <h2 id="connection-access">You stay in control</h2>
          <p>
            Use a Slice-approved AI client. Information returned by its tools may go to that AI
            provider. Enter passwords and verification codes only in the sign-in window, never in
            the AI chat.
          </p>
          <p>
            Your AI only receives tools allowed for your account. There are no business apps
            connected yet, so a successful connection may show an empty app list. This does not
            enable member administration.
          </p>
        </section>
      </main>
    </div>
  );
}
