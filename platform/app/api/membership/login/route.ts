// Kept so existing "Sign in" links keep working: sign-in is now Slice's own Google sign-in.
export function GET() {
  return new Response(null, {
    status: 303,
    headers: { Location: "/api/auth/google/start", "Cache-Control": "no-store" },
  });
}
