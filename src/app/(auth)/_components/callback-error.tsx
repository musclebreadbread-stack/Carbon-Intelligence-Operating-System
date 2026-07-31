"use client";

/**
 * Explains a failed OAuth / email-link callback.
 *
 * `/auth/callback` redirects to `/login?error=<code>` with a short stable code rather
 * than the identity provider's raw message. This component turns each code into
 * locale-aware text the user can act on.
 */

import { useSearchParams } from "next/navigation";

import { useT } from "@/components/providers/locale-provider";
import type { DictionaryKey } from "@/lib/i18n/dictionaries/ko";

const ERROR_CODE_MAP: Record<string, DictionaryKey> = {
  provider_error: "callback.providerError",
  missing_code: "callback.missingCode",
  exchange_failed: "callback.exchangeFailed",
  supabase_unconfigured: "callback.supabaseUnconfigured",
  unexpected: "callback.unexpected",
};

/** Turns a callback error code into a dictionary key. */
export function callbackErrorKey(code: string | null): DictionaryKey | null {
  if (code === null || code === "") return null;
  return ERROR_CODE_MAP[code] ?? "callback.unexpected";
}

/** Turns a callback error code into text a user can act on. (Legacy compat) */
export function callbackErrorMessage(code: string | null): string | null {
  switch (code) {
    case null:
    case "":
      return null;
    case "provider_error":
      return "The identity provider did not complete sign-in. This usually means consent was declined, or the link had already been used.";
    case "missing_code":
      return "The sign-in link is incomplete. Request a new one \u2014 a link can only be followed once, and only before it expires.";
    case "exchange_failed":
      return "The sign-in link could not be verified. It has most likely expired; request a new one.";
    case "supabase_unconfigured":
      return "This deployment has no identity provider configured, so external sign-in cannot complete. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";
    default:
      return "Sign-in could not be completed. Please try again.";
  }
}

export function CallbackError() {
  const t = useT();
  const code = useSearchParams().get("error");
  const key = callbackErrorKey(code);
  if (key === null) return null;

  return (
    <div
      className="rounded-md border border-amber-400/60 p-3 text-sm"
      role="alert"
      data-testid="callback-error"
    >
      {t(key)}
    </div>
  );
}
