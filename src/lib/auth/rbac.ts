/**
 * Authorisation: role-based permissions plus attribute-based access policies.
 *
 * RBAC comes from `UserRole` → `Role` → `RolePermission` → `Permission`, with a
 * `*` wildcard accepted for either `resource` or `action`.
 *
 * ABAC comes from `AccessPolicy.conditions`, evaluated with the *same* operator
 * handlers as the item-14 rules engine — one implementation of `GREATER_THAN`,
 * `IN`, `BETWEEN` and friends for the whole system, so a policy cannot behave
 * differently from a validation rule that reads the same way.
 *
 * Deny wins. Policies are sorted by descending `priority`, and the first matching
 * policy decides; an explicit `deny` at any priority beats every `allow`.
 */

import type { RuleOperator } from "@/lib/core/enums";
import { UnauthorizedError } from "@/lib/core/errors";
import { applyOperator, readField, type RuleContext } from "@/lib/domain/rules/operators";

import type { AccessPolicyLike, PermissionLike, RoleLike, SessionUser } from "./types";

export const WILDCARD = "*";

/** Attributes an authorisation request carries, for the ABAC conditions. */
export type AccessAttributes = RuleContext;

export type AuthorizationDecision = {
  readonly allowed: boolean;
  /** `"rbac"` when a role granted it, `"policy"` when a policy decided it. */
  readonly basis: "rbac" | "policy" | "none";
  readonly reason: string;
  /** Permission that granted the request, when one did. */
  readonly grantedBy: string | null;
  /** Policy that decided the request, when one did. */
  readonly policyId: string | null;
};

function matchesToken(granted: string, requested: string): boolean {
  return granted === WILDCARD || granted.toLowerCase() === requested.toLowerCase();
}

/** True when a permission row covers the requested resource and action. */
export function permissionCovers(
  permission: PermissionLike,
  resource: string,
  action: string,
): boolean {
  return (
    matchesToken(permission.resource, resource) && matchesToken(permission.action, action)
  );
}

/** Permissions the session's roles grant, de-duplicated. */
export function effectivePermissions(session: SessionUser): readonly PermissionLike[] {
  const seen = new Set<string>();
  const permissions: PermissionLike[] = [];
  for (const role of session.roles) {
    for (const permission of role.permissions) {
      const key = `${permission.resource}:${permission.action}`;
      if (seen.has(key)) continue;
      seen.add(key);
      permissions.push(permission);
    }
  }
  return permissions;
}

type PolicyRule = {
  readonly field: string;
  readonly operator: RuleOperator;
  readonly value: string;
};

type PolicyConditions = {
  readonly logicGroup?: "AND" | "OR";
  readonly rules?: readonly PolicyRule[];
};

/** Normalises the untyped `AccessPolicy.conditions` JSON into a rule list. */
export function parsePolicyConditions(conditions: unknown): {
  readonly logicGroup: "AND" | "OR";
  readonly rules: readonly PolicyRule[];
} {
  if (typeof conditions !== "object" || conditions === null) {
    return { logicGroup: "AND", rules: [] };
  }
  const shaped = conditions as PolicyConditions;
  const rules = Array.isArray(shaped.rules) ? shaped.rules : [];
  return {
    logicGroup: shaped.logicGroup === "OR" ? "OR" : "AND",
    rules: rules.filter(
      (rule): rule is PolicyRule =>
        typeof rule?.field === "string" &&
        typeof rule?.operator === "string" &&
        typeof rule?.value === "string",
    ),
  };
}

/**
 * Evaluates one policy's conditions against the request attributes.
 *
 * A policy with no conditions matches everything — that is how a blanket
 * `deny`/`allow` for a resource is expressed.
 */
export function policyMatches(
  policy: AccessPolicyLike,
  attributes: AccessAttributes,
): boolean {
  const { logicGroup, rules } = parsePolicyConditions(policy.conditions);
  if (rules.length === 0) return true;

  const results = rules.map((rule) =>
    applyOperator(rule.operator, readField(attributes, rule.field), rule.value),
  );
  return logicGroup === "OR" ? results.some(Boolean) : results.every(Boolean);
}

/** Policies that apply to this resource and this session's roles. */
function applicablePolicies(
  session: SessionUser,
  resource: string,
): readonly AccessPolicyLike[] {
  const roleIds = new Set(session.roles.map((role) => role.id));
  return session.accessPolicies
    .filter((policy) => policy.isActive !== false)
    .filter((policy) => matchesToken(policy.resource, resource))
    .filter(
      (policy) =>
        policy.appliesToRoleIds === undefined ||
        policy.appliesToRoleIds.length === 0 ||
        policy.appliesToRoleIds.some((roleId) => roleIds.has(roleId)),
    )
    .slice()
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Full authorisation decision, with the reasoning attached so a denial can be
 * explained to the user and recorded in the audit trail.
 */
export function authorize(
  session: SessionUser,
  resource: string,
  action: string,
  attributes: AccessAttributes = {},
): AuthorizationDecision {
  // The tenant boundary is checked before anything else: a session may never act
  // on another organisation's data, whatever its roles say.
  const requestedOrganizationId = attributes.organizationId;
  if (
    typeof requestedOrganizationId === "string" &&
    requestedOrganizationId !== session.organizationId
  ) {
    return {
      allowed: false,
      basis: "policy",
      reason: `Request targets organization ${requestedOrganizationId}, but the session belongs to ${session.organizationId}`,
      grantedBy: null,
      policyId: null,
    };
  }

  if (!session.isActive) {
    return {
      allowed: false,
      basis: "none",
      reason: "The user account is deactivated",
      grantedBy: null,
      policyId: null,
    };
  }

  // An explicit deny policy short-circuits, before any role is considered.
  const attributesWithSession: AccessAttributes = {
    ...attributes,
    userId: session.userId,
    organizationId:
      typeof requestedOrganizationId === "string"
        ? requestedOrganizationId
        : session.organizationId,
    action,
    resource,
  };

  for (const policy of applicablePolicies(session, resource)) {
    if (policy.effect !== "deny") continue;
    if (policyMatches(policy, attributesWithSession)) {
      return {
        allowed: false,
        basis: "policy",
        reason: `Denied by access policy "${policy.name}"`,
        grantedBy: null,
        policyId: policy.id,
      };
    }
  }

  const granting = effectivePermissions(session).find((permission) =>
    permissionCovers(permission, resource, action),
  );
  if (!granting) {
    return {
      allowed: false,
      basis: "none",
      reason: `No role grants ${action} on ${resource}`,
      grantedBy: null,
      policyId: null,
    };
  }

  // An `allow` policy scoped to this resource narrows the RBAC grant: once one
  // exists, the request must satisfy at least one of them.
  const allowPolicies = applicablePolicies(session, resource).filter(
    (policy) => policy.effect !== "deny",
  );
  if (allowPolicies.length > 0) {
    const satisfied = allowPolicies.find((policy) =>
      policyMatches(policy, attributesWithSession),
    );
    if (!satisfied) {
      return {
        allowed: false,
        basis: "policy",
        reason: `${allowPolicies.length} access polic${
          allowPolicies.length === 1 ? "y" : "ies"
        } scope ${resource} and none of them matched this request`,
        grantedBy: null,
        policyId: allowPolicies[0].id,
      };
    }
    return {
      allowed: true,
      basis: "policy",
      reason: `Granted by ${granting.resource}:${granting.action} within access policy "${satisfied.name}"`,
      grantedBy: `${granting.resource}:${granting.action}`,
      policyId: satisfied.id,
    };
  }

  return {
    allowed: true,
    basis: "rbac",
    reason: `Granted by ${granting.resource}:${granting.action}`,
    grantedBy: `${granting.resource}:${granting.action}`,
    policyId: null,
  };
}

/** Boolean form of `authorize`, for UI gating. */
export function can(
  session: SessionUser,
  resource: string,
  action: string,
  attributes: AccessAttributes = {},
): boolean {
  return authorize(session, resource, action, attributes).allowed;
}

/**
 * Asserts the session may perform the action.
 * @throws UnauthorizedError with the decision reasoning attached.
 */
export function requirePermission(
  session: SessionUser,
  resource: string,
  action: string,
  attributes: AccessAttributes = {},
): void {
  const decision = authorize(session, resource, action, attributes);
  if (!decision.allowed) {
    throw new UnauthorizedError(`Not permitted: ${decision.reason}`, {
      resource,
      action,
      userId: session.userId,
      organizationId: session.organizationId,
      basis: decision.basis,
      policyId: decision.policyId,
    });
  }
}

/** Every resource:action pair the session can perform, for the UI permission map. */
export function permissionMatrix(
  session: SessionUser,
  resources: readonly string[],
  actions: readonly string[],
): Readonly<Record<string, Readonly<Record<string, boolean>>>> {
  return Object.fromEntries(
    resources.map((resource) => [
      resource,
      Object.fromEntries(actions.map((action) => [action, can(session, resource, action)])),
    ]),
  );
}

/** Roles carrying a wildcard permission; used to label administrators. */
export function isAdministrator(session: SessionUser): boolean {
  return effectivePermissions(session).some(
    (permission) => permission.resource === WILDCARD && permission.action === WILDCARD,
  );
}

export type { AccessPolicyLike, PermissionLike, RoleLike, SessionUser };
