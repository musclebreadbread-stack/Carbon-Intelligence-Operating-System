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

import { isSupabaseConfigured } from "@/lib/auth/session";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/active-organization";
import { listOrganizations } from "@/lib/data/repositories/organization";

import { actionError, actionSuccess, type ActionState } from "./types";

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
 * is checked against the organisations the deployment actually has, so a forged
 * cookie cannot point a page at another tenant.
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

  const organizations = await listOrganizations();
  if (!organizations.some((organization) => organization.id === organizationId)) {
    return actionError(
      "NOT_FOUND",
      "That organization is not available to this deployment",
      "action.error.NOT_FOUND",
    );
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
