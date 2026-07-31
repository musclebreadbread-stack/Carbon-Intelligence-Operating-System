/**
 * Active-tenant resolution for page reads.
 *
 * The session carries the organisation the *user* belongs to; the organisation the
 * user is currently *looking at* is a UI preference, stored in a cookie by
 * `setActiveOrganizationAction`. Keeping it here rather than in `session.ts` means
 * `getSession()` stays free of `next/headers` and remains unit-testable, and the
 * validity check lives in exactly one place so a forged cookie cannot select another
 * tenant.
 *
 * The check is **membership**, not existence. It used to be "is this id one the
 * deployment has?", which any signed-in user could satisfy with any other tenant's
 * id: setting the cookie by hand switched the whole dashboard, and the report export
 * route, onto somebody else's data. A cookie naming an organisation the session user
 * is not a member of is now ignored, and the user's own organisation is used instead.
 */

import { cookies } from "next/headers";

import { getSession } from "@/lib/auth/session";
import { listOrganizationsForUser } from "@/lib/data/repositories/organization";

export const ACTIVE_ORGANIZATION_COOKIE = "cios-active-organization";

export type ActiveOrganization = {
  readonly id: string;
  readonly name: string;
  /** Organisations the *session user is a member of*, for the switcher. */
  readonly available: readonly { readonly id: string; readonly name: string }[];
};

/**
 * The organisation a page should read.
 *
 * Resolution order: a cookie naming an organisation the user belongs to, then the
 * session's own organisation, then the first membership. With no session at all the
 * id is empty, which every repository read treats as "no rows" rather than as
 * "somebody else's rows".
 */
export async function resolveActiveOrganization(): Promise<ActiveOrganization> {
  const session = await getSession();
  const organizations = session ? await listOrganizationsForUser(session.userId) : [];
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
    // The session's own organisation stays usable even when the membership list
    // could not be read — a database outage puts `listOrganizationsForUser` on the
    // fixture fallback, and locking a real user out of their own tenant because the
    // membership query failed would be a worse failure than a stale switcher.
    session?.organizationId ??
    available[0]?.id ??
    "";

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
