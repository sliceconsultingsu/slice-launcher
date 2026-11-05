import { SetupNotice } from "../../src/ai-connections/setup-notice";
import { CopyField } from "../../src/connect-ai/copy-field";
import { ConnectionStatus } from "../../src/ai-connections/connection-status";
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
        <ConnectionStatus />
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
        <SetupNotice />
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
                <h3>Add Slice to your AI app</h3>
                <p>
                  In your AI app, add a custom connector (also called an MCP server) with the
                  address below. See <a href="#where-to-add">where to add it</a> for Claude and
                  ChatGPT, or copy the instructions on this page into your AI and let it guide you.
                </p>
              </li>
              <li>
                <h3>Sign in and choose Allow</h3>
                <p>
                  Your AI app opens a browser. Sign in with your Slice account if asked. Slice shows
                  an approval page naming the app and where it returns to. Check both, then choose
                  Allow.
                </p>
              </li>
              <li>
                <h3>Check it worked</h3>
                <p>
                  Back in the launcher, the top bar shows <strong>AI connected</strong>. Ask your AI
                  to list your Slice apps. You can see and disconnect connected apps from{" "}
                  <a href="/account#connected-apps">your account</a>.
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
        <section className="connection-boundary" aria-labelledby="where-to-add">
          <h2 id="where-to-add">Where to add it</h2>
          <ul className="connection-clients">
            <li>
              <strong>Claude</strong> (web and desktop): Customize → Connectors → Add → Add custom
              connector. Enter the name Slice and the address. Free plans allow one custom
              connector. On Team and Enterprise plans, an owner adds it for the organization first.
            </li>
            <li>
              <strong>ChatGPT</strong>: Plugins → + → Add custom MCP server, with OAuth sign-in.
              Full support is on Business, Enterprise and Edu plans; other plans may be limited to
              reading.
            </li>
            <li>
              <strong>Claude Code</strong>: run <code>claude mcp add --transport http slice</code>{" "}
              followed by the address, then sign in when asked.
            </li>
          </ul>
          <p className="field-note">
            Menu names checked against Anthropic and OpenAI help pages on November 5, 2026. Apps
            change; if a menu differs, ask your AI to check its current instructions.
          </p>
        </section>
        <section className="connection-boundary" aria-labelledby="connection-access">
          <h2 id="connection-access">You stay in control</h2>
          <p>
            Any AI app that supports MCP sign-in can connect, so choose one you trust with Slice
            information: what Slice tools return goes to that app and its AI provider. Enter
            passwords and verification codes only in the sign-in window, never in the AI chat.
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
