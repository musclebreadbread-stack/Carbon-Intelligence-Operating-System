/**
 * Request proxy: refreshes the Supabase session cookie before a route renders.
 *
 * This file was `src/middleware.ts`. The `middleware` convention is deprecated in
 * Next 16 and renamed to `proxy` (see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`,
 * "Migration to Proxy"), and every `npm run build` printed a deprecation warning about
 * it. The rename is exactly what `npx @next/codemod middleware-to-proxy` performs — the
 * file name and the exported function name — so it is applied here rather than left to
 * fail on a future major.
 *
 * The proxy deliberately does nothing but refresh the auth cookie. Authorisation is
 * *not* done here: the bundled docs warn that a proxy may run outside the application
 * runtime and must not rely on shared modules or globals, and every server action and
 * route handler re-checks the session and the permission itself. A proxy that gated
 * access would be a second authorisation model to keep in sync with the first.
 */

import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except the paths that never carry a session:
     * - _next/static (build output)
     * - _next/image (image optimiser)
     * - favicon.ico and static image assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
