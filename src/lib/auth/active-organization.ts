/**
 * Active-tenant resolution for page reads.
 *
 * The session carries the organisation the *user* belongs to; the organisation the
 * user is currently *looking at* is a UI preference, stored in a cookie by
 * `setActiveOrganizationAction`. Keeping it here rather than in `session.ts` means
 * `getSession()` stays free of `next/headers` and remains unit-testable, and the
 * validity check (the id must be one the deployment actually has) lives in exactly
 * one place so a forged cookie cannot select another tenant.
 */

import { cookies } from "next/headers";

import { getSession } from "@/lib/auth/session";
import {
  getDefaultOrganizationId,
  listOrganizations,
} from "@/lib/data/repositories/organization";

export const ACTIVE_ORGANIZATION_COOKIE = "cios-active-organization";

export type ActiveOrganization = {
  readonly id: string;
  readonly name: string;
  /** Every organisation the deployment knows about, for the switcher. */
  readonly available: readonly { readonly id: string; readonly name: string }[];
};

/**
 * The organisation a page should read. Falls back to the session's organisation,
 * then to the first organisation the deployment has.
 */
export async function resolveActiveOrganization(): Promise<ActiveOrganization> {
  const [session, organizations] = await Promise.all([getSession(), listOrganizations()]);
  const available = organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
  }));

  // `cookies()` is a Request-time API: reading it here is what makes every
  // dashboard route dynamic. It is deliberately not wrapped in a try/catch,
  // because Next signals "this render must be dynamic" by throwing a control-flow
  // error that must be allowed to propagate.
  const cookieStore = await cookies();
  const selected = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;

  const candidates = [selected, session?.organizationId].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const id =
    candidates.find((candidate) => available.some((row) => row.id === candidate)) ??
    available[0]?.id ??
    (await getDefaultOrganizationId());

  return {
    id,
    name: available.find((row) => row.id === id)?.name ?? id,
    available,
  };
}

/** Convenience wrapper for pages that only need the id. */
export async function activeOrganizationId(): Promise<string> {
  return (await resolveActiveOrganization()).id;
}
