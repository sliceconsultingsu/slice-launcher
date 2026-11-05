/** Plain-language reasons for the codes Google sign-in returns as ?sign_in_error=. */
export function signInMessage(code: string): string {
  switch (code) {
    case "domain":
      return "Use your Syracuse Google account (g.syr.edu).";
    case "unverified":
      return "Google has not verified that email address.";
    case "rate":
      return "Too many sign-in attempts. Wait a minute and try again.";
    case "unavailable":
      return "Sign-in is not set up yet. Contact the Slice maintainer.";
    default:
      return "Sign-in did not finish. Please try again.";
  }
}

export function SignInCard({ error }: { error: string | null }) {
  return (
    <section className="account-card sign-in-card">
      <h2>Sign in to Slice</h2>
      {error && (
        <p className="notice error-notice" role="alert">
          {signInMessage(error)}
        </p>
      )}
      <p>Use your Syracuse Google account (g.syr.edu) to reach your profile and organization.</p>
      <a className="primary-button" href="/api/auth/google/start">
        Sign in with Google
      </a>
    </section>
  );
}
