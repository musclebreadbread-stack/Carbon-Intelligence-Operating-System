/**
 * Session resolution.
 *
 * Three ways a session can be established:
 *
 *   1. A Supabase-authenticated user, matched to the `User` row by email.
 *   2. A **demo session** when Supabase is unconfigured — the fixture
 *      administrator — so the whole application is navigable on a clean checkout
 *      without a Supabase project. Mutations are still refused, because the
 *      data layer reports demo mode.
 *   3. An API key, resolved by `withApiKey` in the route-handler layer and passed
 *      to `sessionFromApiKey` here, so the API and the UI share one authorisation
 *      model.
 *
 * `requireSession()` is called at the top of *every* server action: the bundled
 * Next docs are explicit that actions are reachable by direct POST, so a page-level
 * check is not a substitute.
 */

import { UnauthorizedError } from "@/lib/core/errors";
import { getDataMode } from "@/lib/data/db";
import {
  getDefaultOrganizationId,
  getOrganization,
} from "@/lib/data/repositories/organization";
import {
  listAccessPolicies,
  listPermissions,
  listRoles,
  listUsers,
  type ApiKeyPrincipal,
} from "@/lib/data/repositories/security";
import { DEMO_ADMIN_USER_ID, DEMO_ORGANIZATION_ID } from "@/lib/data/demo";

import type { AccessPolicyLike, RoleLike, SessionUser } from "./types";

export type { SessionUser } from "./types";

/** `true` when a real Supabase project is configured (not the placeholder). */
export function isSupabaseConfigured(
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): boolean {
  if (!url || !key) return false;
  if (!/^https?:\/\//.test(url.trim())) return false;
  const lowerKey = key.trim().toLowerCase();
  if (lowerKey.length === 0 || lowerKey.includes("placeholder")) return false;
  return !url.trim().toLowerCase().includes("placeholder");
}

/**
 * Assembles the roles, permissions and policies for a user id in one place, so a
 * Supabase session, a demo session and an API-key session all carry exactly the
 * same authorisation data.
 */
async function loadAuthorization(
  organizationId: string,
  userId: string,
): Promise<{
  readonly roles: readonly RoleLike[];
  readonly accessPolicies: readonly AccessPolicyLike[];
}> {
  const [users, roles, permissions, policies] = await Promise.all([
    listUsers(organizationId),
    listRoles(organizationId),
    listPermissions(),
    listAccessPolicies(organizationId),
  ]);

  const permissionById = new Map(permissions.map((permission) => [permission.id, permission]));
  const user = users.find((candidate) => candidate.id === userId);
  const roleIds = new Set(user?.roleIds ?? []);

  return {
    roles: roles
      .filter((role) => roleIds.has(role.id))
      .map((role) => ({
        id: role.id,
        name: role.name,
        isSystem: role.isSystem,
        permissions: role.permissionIds
          .map((permissionId) => permissionById.get(permissionId))
          .filter((permission): permission is NonNullable<typeof permission> =>
            permission !== undefined,
          )
          .map((permission) => ({
            resource: permission.resource,
            action: permission.action,
            description: permission.description,
          })),
      })),
    accessPolicies: policies.map((policy) => ({
      id: policy.id,
      name: policy.name,
      resource: policy.resource,
      conditions: policy.conditions,
      effect: policy.effect,
      priority: policy.priority,
      isActive: policy.isActive,
      appliesToRoleIds: policy.appliesToRoleIds,
    })),
  };
}

/** The offline session used when Supabase is unconfigured. */
export async function getDemoSession(): Promise<SessionUser> {
  const organizationId = await getDefaultOrganizationId();
  const [organization, users] = await Promise.all([
    getOrganization(organizationId),
    listUsers(organizationId),
  ]);
  const user =
    users.find((candidate) => candidate.id === DEMO_ADMIN_USER_ID) ?? users[0] ?? null;
  const userId = user?.id ?? DEMO_ADMIN_USER_ID;
  const { roles, accessPolicies } = await loadAuthorization(organizationId, userId);

  return {
    userId,
    email: user?.email ?? "admin@example.com",
    name: user?.name ?? "Demo administrator",
    organizationId: organization?.id ?? DEMO_ORGANIZATION_ID,
    organizationName: organization?.name ?? "Demo organization",
    isActive: true,
    roles,
    accessPolicies,
    source: "demo",
  };
}

/**
 * Resolves the current session, or `null` when nobody is signed in.
 *
 * The Supabase client is imported lazily so this module can be unit-tested and
 * imported from a Route Handler without pulling `next/headers` into every caller.
 */
export async function getSession(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) {
    return getDemoSession();
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;

  const organizationId = await getDefaultOrganizationId();
  const [organization, users] = await Promise.all([
    getOrganization(organizationId),
    listUsers(organizationId),
  ]);

  const email = user.email.toLowerCase();
  const row = users.find((candidate) => candidate.email.toLowerCase() === email);
  if (!row) {
    // Authenticated with Supabase but with no `User` row: the account exists in
    // the identity provider and not in the tenant, which is not a session.
    return null;
  }

  const { roles, accessPolicies } = await loadAuthorization(row.organizationId, row.id);

  return {
    userId: row.id,
    email: row.email,
    name: row.name,
    organizationId: row.organizationId,
    organizationName: organization?.name ?? row.organizationId,
    isActive: row.isActive,
    roles,
    accessPolicies,
    source: "supabase",
  };
}

/**
 * Asserts a session exists.
 * @throws UnauthorizedError
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError("Sign in to continue", { dataMode: getDataMode() });
  }
  if (!session.isActive) {
    throw new UnauthorizedError("This account has been deactivated", {
      userId: session.userId,
    });
  }
  return session;
}

/** Active organisation for the current session. */
export async function getActiveOrganizationId(): Promise<string> {
  const session = await getSession();
  return session?.organizationId ?? (await getDefaultOrganizationId());
}

/**
 * Builds a session from an authenticated API key. The key's `scopes` are carried
 * on the session so a handler can narrow beyond the key owner's roles.
 */
export async function sessionFromApiKey(
  principal: ApiKeyPrincipal,
): Promise<SessionUser | null> {
  const [organization, users] = await Promise.all([
    getOrganization(principal.organizationId),
    listUsers(principal.organizationId),
  ]);
  const user = users.find((candidate) => candidate.id === principal.userId);
  if (!user || !user.isActive) return null;

  const { roles, accessPolicies } = await loadAuthorization(
    principal.organizationId,
    principal.userId,
  );

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: principal.organizationId,
    organizationName: organization?.name ?? principal.organizationId,
    isActive: user.isActive,
    roles,
    accessPolicies,
    source: "apiKey",
    scopes: principal.scopes,
  };
}

/** Configuration status for the settings and health views. */
export function getAuthStatus() {
  return {
    supabaseConfigured: isSupabaseConfigured(),
    dataMode: getDataMode(),
  };
}
