/**
 * Session and authorisation shapes.
 *
 * Kept in their own module so `rbac.ts` stays free of any Supabase or Prisma
 * import and can be unit-tested with plain objects.
 */

export type PermissionLike = {
  readonly resource: string;
  readonly action: string;
  readonly description?: string | null;
};

export type RoleLike = {
  readonly id: string;
  readonly name: string;
  readonly isSystem?: boolean;
  readonly permissions: readonly PermissionLike[];
};

export type AccessPolicyLike = {
  readonly id: string;
  readonly name: string;
  readonly resource: string;
  /** Untyped JSON as stored; normalised by `parsePolicyConditions`. */
  readonly conditions: unknown;
  readonly effect: "allow" | "deny";
  readonly priority?: number;
  readonly isActive?: boolean;
  /** Empty or absent means the policy applies to every role. */
  readonly appliesToRoleIds?: readonly string[];
};

export type SessionUser = {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly isActive: boolean;
  readonly roles: readonly RoleLike[];
  readonly accessPolicies: readonly AccessPolicyLike[];
  /**
   * How the session was established:
   *   `supabase` — a real authenticated Supabase user
   *   `demo`     — Supabase is unconfigured, so the fixture admin is assumed
   *   `apiKey`   — an `APIKey` bearer token on a route handler
   */
  readonly source: "supabase" | "demo" | "apiKey";
  /** Scopes, when the session came from an API key. */
  readonly scopes?: readonly string[];
};
