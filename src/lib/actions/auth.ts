"use server";

/**
 * Authentication and tenant-selection actions.
 *
 * Sign-out has to work in both modes: with Supabase configured it revokes the
 * session cookie through the SSR client, and with Supabase unconfigured (the demo
 * session) there is nothing to revoke, so it just returns the user to `/login`.
 * Either way the redirect is the same, so the header's menu behaves identically.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { isSupabaseConfigured, requireSession } from "@/lib/auth/session";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/active-organization";
import { listOrganizationMemberships } from "@/lib/data/repositories/organization-membership";
import { LOCALE_COOKIE, parseLocale } from "@/lib/i18n/locales";

import { actionError, actionSuccess, toActionError, type ActionState } from "./types";

/** Signs the current user out and returns them to the login page. */
export async function signOutAction(): Promise<never> {
  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  // Drop the tenant selection too: it is scoped to the signed-in user.
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
  redirect("/login");
}

/**
 * Records the organisation the user is looking at.
 *
 * Stored in a cookie rather than on the session, because the session is derived
 * from the identity provider and the tenant selection is a UI preference. The id
 * is checked against the caller's own `OrganizationMembership` rows (plus their
 * home organisation, always an implicit membership) — never against every
 * organisation the deployment happens to have — so a forged cookie cannot point
 * a page at another tenant's data.
 */
export async function setActiveOrganizationAction(
  organizationId: unknown,
): Promise<ActionState<{ readonly organizationId: string }>> {
  if (typeof organizationId !== "string" || organizationId.length === 0) {
    return actionError(
      "VALIDATION_ERROR",
      "An organization id is required",
      "action.error.validation",
      { fieldErrors: { organizationId: ["An organization id is required"] } },
    );
  }

  try {
    const session = await requireSession();
    if (organizationId !== session.organizationId) {
      const memberships = await listOrganizationMemberships(session.userId);
      const belongs = memberships.some((membership) => membership.organizationId === organizationId);
      if (!belongs) {
        return actionError(
          "NOT_FOUND",
          "You are not a member of that organization",
          "action.error.NOT_FOUND",
        );
      }
    }
  } catch (error) {
    return toActionError(error);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");

  return actionSuccess(
    { organizationId },
    "Switched organization.",
    "action.success.setActiveOrganization",
  );
}

/**
 * Sets the user's locale preference via cookie.
 *
 * Only allowed values (`ko`, `en`) are written; anything else is silently
 * normalised to the default. The cookie is httpOnly, one year, same-site lax —
 * read server-side by `getLocale()` in the root layout, so switching locale
 * revalidates the whole tree rather than relying on client-only state.
 */
export async function setLocaleAction(locale: unknown): Promise<void> {
  const parsed = parseLocale(typeof locale === "string" ? locale : null);
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, parsed, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
