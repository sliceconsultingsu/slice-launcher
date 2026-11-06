/** Plain-language reasons for the codes Google sign-in returns as ?sign_in_error=. */
export function signInMessage(code: string): string {
  switch (code) {
    case "email":
      return "This Google account can't be matched to your Slice invitation. Sign in with the Google account an administrator invited, or ask them to update it.";
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
      <p>
        Use your Google account to reach your profile and organization. New members wait for an
        administrator&apos;s approval.
      </p>
      <a className="primary-button" href="/api/auth/google/start">
        Sign in with Google
      </a>
    </section>
  );
}
