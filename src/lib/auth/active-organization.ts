/**
 * Active-tenant resolution for page reads.
 *
 * The session carries the organisation the *user* belongs to (their "home"
 * organisation — the anchor `session.organizationId`, used unchanged by every
 * write path in `src/lib/actions/runtime.ts`). The organisation the user is
 * currently *looking at* is a UI preference, stored in a cookie by
 * `setActiveOrganizationAction`. Keeping it here rather than in `session.ts` means
 * `getSession()` stays free of `next/headers` and remains unit-testable.
 *
 * The cookie is validated against the user's actual `OrganizationMembership`
 * rows (plus their home organisation, which is always an implicit membership) —
 * not against every organisation the deployment happens to have. A cookie naming
 * an organisation the user does not belong to is silently ignored and the home
 * organisation is used instead, so a forged or stale cookie cannot read another
 * tenant's data. This is a read-only preference: it never changes which
 * organisation writes are attributed to.
 */

import { cookies } from "next/headers";

import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationId } from "@/lib/data/repositories/organization";
import { listOrganizationMemberships } from "@/lib/data/repositories/organization-membership";

export const ACTIVE_ORGANIZATION_COOKIE = "cios-active-organization";

export type ActiveOrganization = {
  readonly id: string;
  readonly name: string;
  /** The organisations this user may read: their home org plus any membership. */
  readonly available: readonly { readonly id: string; readonly name: string }[];
};

/**
 * The organisation a page should read. Falls back to the session's home
 * organisation, then to the deployment's default organisation when there is no
 * session at all.
 */
export async function resolveActiveOrganization(): Promise<ActiveOrganization> {
  const session = await getSession();

  if (!session) {
    const id = await getDefaultOrganizationId();
    return { id, name: id, available: [{ id, name: id }] };
  }

  const memberships = await listOrganizationMemberships(session.userId);
  const available = new Map<string, string>();
  // The home organisation is always a valid read target, independent of the
  // membership table — it is what the session itself is scoped to.
  available.set(session.organizationId, session.organizationName);
  for (const membership of memberships) {
    available.set(membership.organizationId, membership.organizationName);
  }

  // `cookies()` is a Request-time API: reading it here is what makes every
  // dashboard route dynamic. It is deliberately not wrapped in a try/catch,
  // because Next signals "this render must be dynamic" by throwing a control-flow
  // error that must be allowed to propagate.
  const cookieStore = await cookies();
  const selected = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;

  const id = selected && available.has(selected) ? selected : session.organizationId;

  return {
    id,
    name: available.get(id) ?? id,
    available: [...available].map(([orgId, name]) => ({ id: orgId, name })),
  };
}

/** Convenience wrapper for pages that only need the id. */
export async function activeOrganizationId(): Promise<string> {
  return (await resolveActiveOrganization()).id;
}
