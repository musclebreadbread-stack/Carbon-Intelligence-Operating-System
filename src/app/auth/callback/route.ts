/**
 * Supabase OAuth / email-link callback.
 *
 * The provider redirects here with a `code` to exchange for a session. Everything that
 * can go wrong ends in a redirect to `/login` **carrying a reason**, because the
 * previous version redirected there with nothing at all: a user whose OAuth consent
 * failed, whose link had expired, or who arrived at a deployment with no Supabase
 * project configured was bounced silently back to the login form with no indication that
 * anything had happened, let alone what. Its own comment claimed to redirect "with error
 * info" and did not.
 *
 * The reason is a short stable code, never the provider's raw message: an error string
 * reflected into a URL is both a phishing surface and a way to fingerprint the identity
 * provider's configuration.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/client";

/** Stable codes the login page turns into human-readable text. */
export const CALLBACK_ERROR_CODES = [
  "missing_code",
  "provider_error",
  "exchange_failed",
  "supabase_unconfigured",
  "unexpected",
] as const;
export type CallbackErrorCode = (typeof CALLBACK_ERROR_CODES)[number];

/**
 * Builds the redirect back to the sign-in page.
 *
 * `next` is validated as a same-site absolute path before being echoed back, so the
 * callback cannot be used as an open redirect: `//evil.example` and `https://evil…`
 * both fall back to `/dashboard`.
 */
function loginRedirect(origin: string, code: CallbackErrorCode, next: string): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("error", code);
  if (next !== "/dashboard") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

function safeNext(value: string | null): string {
  if (value === null) return "/dashboard";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // The provider reports its own refusals (consent denied, expired link) as `error`
  // rather than by omitting the code, so this has to be checked first.
  if (searchParams.get("error") !== null) {
    return loginRedirect(origin, "provider_error", next);
  }
  if (code === null || code.length === 0) {
    return loginRedirect(origin, "missing_code", next);
  }
  if (!isSupabaseConfigured()) {
    // Reached when a deployment publishes the callback URL but has no project
    // configured. Without this the exchange fails obscurely against an empty URL.
    return loginRedirect(origin, "supabase_unconfigured", next);
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Logged server-side; only the stable code reaches the URL.
      console.error("[auth/callback] code exchange failed", error.message);
      return loginRedirect(origin, "exchange_failed", next);
    }

    return NextResponse.redirect(new URL(next, origin));
  } catch (error) {
    // A network failure or a malformed project URL must not surface as a 500 on the
    // one route a user reaches mid-sign-in.
    console.error("[auth/callback] unexpected failure", error);
    return loginRedirect(origin, "unexpected", next);
  }
}
