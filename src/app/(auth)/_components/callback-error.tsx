"use client";

/**
 * Explains a failed OAuth / email-link callback.
 *
 * `/auth/callback` redirects to `/login?error=<code>` with a short stable code rather
 * than the identity provider's raw message, so the wording lives in one place and
 * nothing reflected from the provider is ever rendered. It previously redirected with
 * *nothing*, so a user whose consent failed or whose link had expired was bounced back
 * to the sign-in form with no indication that anything had happened.
 *
 * Isolated into its own component on purpose. `useSearchParams` forces a client-side
 * bailout in any statically prerendered page, and the bundled Next 16 docs
 * (`03-api-reference/04-functions/use-search-params.md`) require a `Suspense` boundary
 * around it in a production build. Keeping it in this leaf and wrapping *it* confines
 * the bailout to a one-line notice, so `/login` itself still prerenders as static
 * — wrapping the whole form would make the entire sign-in page render on demand.
 */

import { useSearchParams } from "next/navigation";

/** Turns a callback error code into text a user can act on. */
export function callbackErrorMessage(code: string | null): string | null {
  switch (code) {
    case null:
    case "":
      return null;
    case "provider_error":
      return "The identity provider did not complete sign-in. This usually means consent was declined, or the link had already been used.";
    case "missing_code":
      return "The sign-in link is incomplete. Request a new one — a link can only be followed once, and only before it expires.";
    case "exchange_failed":
      return "The sign-in link could not be verified. It has most likely expired; request a new one.";
    case "supabase_unconfigured":
      return "This deployment has no identity provider configured, so external sign-in cannot complete. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";
    default:
      // An unknown code is still reported: silence is what this component exists to fix.
      return "Sign-in could not be completed. Please try again.";
  }
}

export function CallbackError() {
  const message = callbackErrorMessage(useSearchParams().get("error"));
  if (message === null) return null;

  return (
    <div
      className="rounded-md border border-amber-400/60 p-3 text-sm"
      role="alert"
      data-testid="callback-error"
    >
      {message}
    </div>
  );
}
