// The outbound Worker for member apps (docs/member-apps.md). Every fetch() an app's server code
// makes arrives here instead of leaving Slice, and is refused. An app's code can reach its own
// database and nothing else: no other service, no other app, not the launcher.
//
// It is bound to the launcher's dispatch namespace in platform/wrangler.jsonc and deployed on its
// own, by the maintainer, when server code is switched on. It holds no bindings and no secrets.
/* global Response */
export default {
  fetch() {
    return new Response("Member apps cannot call other services.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
};
