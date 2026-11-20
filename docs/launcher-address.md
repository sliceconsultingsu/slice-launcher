# The launcher's address

The launcher lives at `https://sliceos.app`. Its first address, `slice-launcher.ivan27chen.workers.dev`, redirects there. This guide records how the move was made, in two steps so that nothing a member saw changed until the new address had been checked, and how to go back.

| Step                | What changes                                                               | What members notice                        |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| 1. Add the address  | The launcher also answers at `https://sliceos.app`.                        | Nothing. The old address works as before.  |
| 2. Move (later day) | The old address redirects to the new one. Slice's guides name the new one. | They sign in again and reconnect their AI. |

## How it works

The launcher works out its own address from each request: the Google sign-in return address, the same-address check on every change, and the AI sign-in details all follow the address the person is on. Sessions are tied to one address, so a session at the old address is not a session at the new one.

Two settings in `platform/wrangler.jsonc` control the move:

- `LAUNCHER_ORIGIN` is the one address Slice tells people to use.
- `FORMER_HOSTS` lists earlier hosts, separated by commas. Every request to one of them is answered with a redirect (HTTP 308, never cached) to the same path at `LAUNCHER_ORIGIN`. While it is empty, nothing redirects.

A wrong setting leaves the old address serving. `LAUNCHER_ORIGIN` must be a bare `https://` address with no path, and must not itself be listed in `FORMER_HOSTS`; otherwise no redirect happens.

## Step 1: add the address

Before merging the pull request that adds `routes` to `platform/wrangler.jsonc`, the maintainer confirms:

1. **`sliceos.app` is an active zone on the Cloudflare account that holds the `slice-launcher` Worker.** A custom domain can only be attached to a zone on the same account.
2. **The zone has no DNS record for `sliceos.app` itself.** Cloudflare creates the record and the certificate when the custom domain is added, and refuses if one exists.
3. **The release token can add the domain.** The `CLOUDFLARE_API_TOKEN` secret in the `production` environment needs _Zone → Workers Routes → Edit_ for `sliceos.app` in addition to what it has. Without it the release that adds the domain fails after the new code is uploaded. Later releases do not need it.

After that release succeeds:

4. **Add `https://sliceos.app/api/auth/google/callback`** to the Google sign-in client's authorized redirect addresses. Keep the old one. Until this is done, sign-in at the new address fails at Google and the old address is unaffected.
5. **Check the new address.** Open `https://sliceos.app`, sign in, open an app, and connect an AI app to `https://sliceos.app/mcp`. Run the release check against it:

   ```sh
   EXPECTED_RELEASE_SHA=$(git rev-parse origin/main) SLICE_MCP_REQUIRED=true node scripts/check-launcher.mjs https://sliceos.app
   ```

Both addresses now work, each with its own sign-in.

## Step 2: move

On the day the maintainer chooses:

1. **Tell members first.** Everyone signs in again at the new address. Anyone who connected an AI app removes the old Slice connection and adds `https://sliceos.app/mcp`, following [Connect your AI](connect-your-ai.md).
2. **Point the release check at the new address.** Set the repository variable `SLICE_LAUNCHER_URL` to `https://sliceos.app`. The check refuses redirects, so a release that turns the redirect on fails if it is still checking the old address.
3. **Merge the move pull request.** It sets `FORMER_HOSTS` to `slice-launcher.ivan27chen.workers.dev` and changes the address in the guides and in the **Connect your AI** page.
4. **Check.** `https://slice-launcher.ivan27chen.workers.dev/account` should land on `https://sliceos.app/account`. Sign in there.

Keep `workers_dev` switched on in `platform/wrangler.jsonc`: the old address has to keep reaching the Worker for the redirect to work. Keep the old Google redirect address until the move has settled; it is unused once the redirect is on.

## Going back

Set `FORMER_HOSTS` back to `""` through a pull request, or roll back to the release before the move ([releases and recovery](deployment.md#explicit-rollback)). The redirect is not cached, so the old address serves again as soon as that release is live. Set `SLICE_LAUNCHER_URL` back to the old address first if rolling back. Sessions and AI connections made at the old address before the move still exist there until they expire.

## The first attempt, November 20, 2026

The release that first added the address uploaded the new code and then failed to attach the domain: Cloudflare answered "The zone "sliceos.app" does not exist on your account" (code 10084) to the release token, twice. The launcher kept working at its old address, and the `routes` line was taken out again so that other releases were not held up.

The cause was the release token. The zone was on the right account all along, but the token stored in GitHub's `production` environment dated from October 4 and could not see it. A token's zone permissions apply only to the zones in its **Zone Resources**; it needs _Zone → Zone → Read_ and _Zone → Workers Routes → Edit_ with `sliceos.app` included. A replacement token was checked with read-only calls before it was stored: it could see the zone (active, on the Worker's account), the Worker and the membership database.

If the same message appears again, check the token before anything else. That message does not necessarily mean the zone is missing.

## What has and has not been verified

On November 20, 2026 the address was attached and checked from outside: `https://sliceos.app` serves the released version, its pages, redirects and AI sign-in details all use the new address, the membership API and `/mcp` refuse requests without a sign-in, and sign-in there asks Google to return to `https://sliceos.app/api/auth/google/callback`. The old address still serves.

Not yet checked: a real Google sign-in at the new address (it needs that return address added to the Google sign-in client), and the redirect from the old address, which is tested only on a local Worker with made-up addresses.
