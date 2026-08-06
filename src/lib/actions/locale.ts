"use server";

/**
 * UI locale selection.
 *
 * A display preference, not a protected resource — no session or RBAC check,
 * the same way `setActiveOrganizationAction` treats the tenant-switcher cookie
 * as a UI concern rather than a mutation that needs the `runAction` pipeline.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { LOCALE_COOKIE } from "@/lib/i18n/locale";
import { LOCALES, type Locale } from "@/lib/i18n/messages";

import { actionError, actionSuccess, type ActionState } from "./types";

export async function setLocaleAction(
  locale: unknown,
): Promise<ActionState<{ readonly locale: Locale }>> {
  if (typeof locale !== "string" || !(LOCALES as readonly string[]).includes(locale)) {
    const message = `locale must be one of: ${LOCALES.join(", ")}`;
    return actionError("VALIDATION_ERROR", message, "action.error.validation", {
      fieldErrors: { locale: [message] },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");

  return actionSuccess({ locale: locale as Locale }, "Locale updated.", "action.success.setLocale");
}
