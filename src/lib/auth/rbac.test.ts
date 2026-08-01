import { describe, expect, it } from "vitest";

import { UnauthorizedError } from "@/lib/core/errors";

import {
  authorize,
  can,
  effectivePermissions,
  isAdministrator,
  parsePolicyConditions,
  permissionCovers,
  permissionMatrix,
  policyMatches,
  requirePermission,
} from "./rbac";
import type { AccessPolicyLike, PermissionLike, SessionUser } from "./types";

const ORG = "org-1";

function session(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: "user-1",
    email: "user@example.com",
    name: "Test user",
    organizationId: ORG,
    organizationName: "Test org",
    isActive: true,
    roles: [],
    accessPolicies: [],
    source: "demo",
    ...overrides,
  };
}

function role(name: string, permissions: readonly PermissionLike[]) {
  return { id: `role-${name}`, name, permissions };
}

const READ_EMISSION: PermissionLike = { resource: "emission", action: "read" };
const WRITE_EMISSION: PermissionLike = { resource: "emission", action: "write" };
const WILDCARD_ALL: PermissionLike = { resource: "*", action: "*" };

describe("permissionCovers", () => {
  it("matches an exact resource and action", () => {
    expect(permissionCovers(READ_EMISSION, "emission", "read")).toBe(true);
    expect(permissionCovers(READ_EMISSION, "emission", "write")).toBe(false);
    expect(permissionCovers(READ_EMISSION, "target", "read")).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(permissionCovers(READ_EMISSION, "EMISSION", "READ")).toBe(true);
  });

  it("treats * as a wildcard on either side of the pair", () => {
    expect(permissionCovers({ resource: "emission", action: "*" }, "emission", "delete")).toBe(
      true,
    );
    expect(permissionCovers({ resource: "*", action: "read" }, "anything", "read")).toBe(true);
    expect(permissionCovers(WILDCARD_ALL, "anything", "anything")).toBe(true);
  });
});

describe("RBAC", () => {
  it("denies a user with only emission:read the write action", () => {
    const reader = session({ roles: [role("reader", [READ_EMISSION])] });
    expect(can(reader, "emission", "read")).toBe(true);
    expect(can(reader, "emission", "write")).toBe(false);

    const decision = authorize(reader, "emission", "write");
    expect(decision.allowed).toBe(false);
    expect(decision.basis).toBe("none");
    expect(decision.reason).toMatch(/No role grants write on emission/);
  });

  it("grants every action on a resource from a resource wildcard", () => {
    const editor = session({
      roles: [role("editor", [{ resource: "emission", action: "*" }])],
    });
    for (const action of ["read", "create", "update", "delete", "approve"]) {
      expect(can(editor, "emission", action), action).toBe(true);
    }
    expect(can(editor, "security", "read")).toBe(false);
  });

  it("grants everything from a full wildcard, and labels the session admin", () => {
    const admin = session({ roles: [role("admin", [WILDCARD_ALL])] });
    expect(can(admin, "security", "delete")).toBe(true);
    expect(isAdministrator(admin)).toBe(true);
    expect(isAdministrator(session({ roles: [role("reader", [READ_EMISSION])] }))).toBe(false);
  });

  it("unions permissions across roles and de-duplicates them", () => {
    const multi = session({
      roles: [role("a", [READ_EMISSION, WRITE_EMISSION]), role("b", [READ_EMISSION])],
    });
    expect(effectivePermissions(multi)).toHaveLength(2);
    expect(can(multi, "emission", "write")).toBe(true);
  });

  it("denies everything to a session with no roles", () => {
    expect(can(session(), "emission", "read")).toBe(false);
  });

  it("denies a deactivated account even with a full wildcard", () => {
    const suspended = session({ isActive: false, roles: [role("admin", [WILDCARD_ALL])] });
    const decision = authorize(suspended, "emission", "read");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/deactivated/);
  });

  it("reports which permission granted the request", () => {
    const editor = session({ roles: [role("editor", [WRITE_EMISSION])] });
    const decision = authorize(editor, "emission", "write");
    expect(decision.allowed).toBe(true);
    expect(decision.basis).toBe("rbac");
    expect(decision.grantedBy).toBe("emission:write");
  });
});

describe("tenant isolation", () => {
  it("refuses a request targeting another organisation, whatever the roles say", () => {
    const admin = session({ roles: [role("admin", [WILDCARD_ALL])] });
    const decision = authorize(admin, "emission", "read", { organizationId: "other-org" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/session belongs to org-1/);
  });

  it("allows a request that names its own organisation", () => {
    const admin = session({ roles: [role("admin", [WILDCARD_ALL])] });
    expect(can(admin, "emission", "read", { organizationId: ORG })).toBe(true);
  });
});

describe("parsePolicyConditions", () => {
  it("normalises a well-formed condition block", () => {
    const parsed = parsePolicyConditions({
      logicGroup: "OR",
      rules: [{ field: "facilityId", operator: "EQUALS", value: "fac-1" }],
    });
    expect(parsed.logicGroup).toBe("OR");
    expect(parsed.rules).toHaveLength(1);
  });

  it("defaults to AND and drops malformed rules", () => {
    const parsed = parsePolicyConditions({
      rules: [
        { field: "facilityId", operator: "EQUALS", value: "fac-1" },
        { field: 42, operator: "EQUALS", value: "x" },
        { operator: "EQUALS", value: "x" },
      ],
    });
    expect(parsed.logicGroup).toBe("AND");
    expect(parsed.rules).toHaveLength(1);
  });

  it("treats a non-object as no conditions", () => {
    expect(parsePolicyConditions(null).rules).toEqual([]);
    expect(parsePolicyConditions("nonsense").rules).toEqual([]);
    expect(parsePolicyConditions(undefined).rules).toEqual([]);
  });
});

describe("policyMatches", () => {
  const policy = (conditions: unknown): AccessPolicyLike => ({
    id: "policy-1",
    name: "Test policy",
    resource: "activity_data",
    conditions,
    effect: "allow",
  });

  it("matches a policy with no conditions", () => {
    expect(policyMatches(policy({}), {})).toBe(true);
  });

  it("uses the shared rule operators", () => {
    const numeric = policy({
      rules: [{ field: "quantity", operator: "GREATER_THAN", value: "100" }],
    });
    expect(policyMatches(numeric, { quantity: 150 })).toBe(true);
    expect(policyMatches(numeric, { quantity: 50 })).toBe(false);

    const list = policy({
      rules: [{ field: "facilityId", operator: "IN", value: "fac-1,fac-2" }],
    });
    expect(policyMatches(list, { facilityId: "fac-2" })).toBe(true);
    expect(policyMatches(list, { facilityId: "fac-9" })).toBe(false);

    const range = policy({
      rules: [{ field: "reportingYear", operator: "BETWEEN", value: "2023,2025" }],
    });
    expect(policyMatches(range, { reportingYear: 2024 })).toBe(true);
    expect(policyMatches(range, { reportingYear: 2026 })).toBe(false);
  });

  it("honours AND versus OR grouping", () => {
    const and = policy({
      logicGroup: "AND",
      rules: [
        { field: "facilityId", operator: "EQUALS", value: "fac-1" },
        { field: "reportingYear", operator: "EQUALS", value: "2024" },
      ],
    });
    expect(policyMatches(and, { facilityId: "fac-1", reportingYear: 2024 })).toBe(true);
    expect(policyMatches(and, { facilityId: "fac-1", reportingYear: 2023 })).toBe(false);

    const or = policy({
      logicGroup: "OR",
      rules: [
        { field: "facilityId", operator: "EQUALS", value: "fac-1" },
        { field: "facilityId", operator: "EQUALS", value: "fac-2" },
      ],
    });
    expect(policyMatches(or, { facilityId: "fac-2" })).toBe(true);
    expect(policyMatches(or, { facilityId: "fac-3" })).toBe(false);
  });

  it("handles a missing attribute with IS_NULL", () => {
    const isNull = policy({
      rules: [{ field: "facilityId", operator: "IS_NULL", value: "" }],
    });
    expect(policyMatches(isNull, {})).toBe(true);
    expect(policyMatches(isNull, { facilityId: "fac-1" })).toBe(false);
  });
});

describe("ABAC narrowing", () => {
  const facilityScoped: AccessPolicyLike = {
    id: "policy-ulsan",
    name: "Ulsan only",
    resource: "activity_data",
    conditions: {
      logicGroup: "AND",
      rules: [{ field: "facilityId", operator: "EQUALS", value: "fac-ulsan" }],
    },
    effect: "allow",
    priority: 100,
    isActive: true,
    appliesToRoleIds: ["role-operator"],
  };

  const operator = session({
    roles: [
      {
        id: "role-operator",
        name: "operator",
        permissions: [
          { resource: "activity_data", action: "read" },
          { resource: "activity_data", action: "update" },
        ],
      },
    ],
    accessPolicies: [facilityScoped],
  });

  it("allows the scoped facility and denies another one", () => {
    expect(can(operator, "activity_data", "update", { facilityId: "fac-ulsan" })).toBe(true);
    const denied = authorize(operator, "activity_data", "update", {
      facilityId: "fac-pyeongtaek",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.basis).toBe("policy");
    expect(denied.policyId).toBe("policy-ulsan");
  });

  it("reports the policy that granted the request", () => {
    const decision = authorize(operator, "activity_data", "read", {
      facilityId: "fac-ulsan",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.basis).toBe("policy");
    expect(decision.policyId).toBe("policy-ulsan");
    expect(decision.grantedBy).toBe("activity_data:read");
  });

  it("leaves other resources untouched by a resource-scoped policy", () => {
    const withRead = session({
      roles: [
        {
          id: "role-operator",
          name: "operator",
          permissions: [
            { resource: "activity_data", action: "read" },
            { resource: "mrv", action: "read" },
          ],
        },
      ],
      accessPolicies: [facilityScoped],
    });
    expect(can(withRead, "mrv", "read")).toBe(true);
  });

  it("ignores a policy that does not apply to any of the session's roles", () => {
    const otherRole = session({
      roles: [role("analyst", [{ resource: "activity_data", action: "update" }])],
      accessPolicies: [facilityScoped],
    });
    // The policy is scoped to role-operator, so the analyst's RBAC grant stands.
    expect(can(otherRole, "activity_data", "update", { facilityId: "fac-anything" })).toBe(true);
  });

  it("ignores an inactive policy", () => {
    const inactive = session({
      roles: [
        {
          id: "role-operator",
          name: "operator",
          permissions: [{ resource: "activity_data", action: "update" }],
        },
      ],
      accessPolicies: [{ ...facilityScoped, isActive: false }],
    });
    expect(can(inactive, "activity_data", "update", { facilityId: "fac-elsewhere" })).toBe(true);
  });

  it("applies a role-agnostic policy to every role", () => {
    const global = session({
      roles: [role("analyst", [{ resource: "activity_data", action: "update" }])],
      accessPolicies: [{ ...facilityScoped, appliesToRoleIds: [] }],
    });
    expect(can(global, "activity_data", "update", { facilityId: "fac-ulsan" })).toBe(true);
    expect(can(global, "activity_data", "update", { facilityId: "fac-other" })).toBe(false);
  });
});

describe("deny wins", () => {
  const denyPolicy: AccessPolicyLike = {
    id: "policy-deny",
    name: "Deny published years",
    resource: "*",
    conditions: {
      rules: [{ field: "isPublished", operator: "EQUALS", value: "true" }],
    },
    effect: "deny",
    priority: 1_000,
    isActive: true,
  };

  const admin = session({
    roles: [role("admin", [WILDCARD_ALL])],
    accessPolicies: [denyPolicy],
  });

  it("beats a full wildcard permission", () => {
    const decision = authorize(admin, "activity_data", "update", { isPublished: true });
    expect(decision.allowed).toBe(false);
    expect(decision.policyId).toBe("policy-deny");
    expect(decision.reason).toMatch(/Deny published years/);
  });

  it("does not fire when its conditions do not match", () => {
    expect(can(admin, "activity_data", "update", { isPublished: false })).toBe(true);
  });

  it("beats a higher-priority allow policy", () => {
    const conflicted = session({
      roles: [role("admin", [WILDCARD_ALL])],
      accessPolicies: [
        denyPolicy,
        {
          id: "policy-allow-all",
          name: "Allow all",
          resource: "*",
          conditions: {},
          effect: "allow",
          priority: 9_999,
          isActive: true,
        },
      ],
    });
    expect(can(conflicted, "activity_data", "update", { isPublished: true })).toBe(false);
  });
});

describe("requirePermission", () => {
  it("returns silently when permitted", () => {
    const editor = session({ roles: [role("editor", [WRITE_EMISSION])] });
    expect(() => requirePermission(editor, "emission", "write")).not.toThrow();
  });

  it("throws UnauthorizedError with the reasoning attached", () => {
    const reader = session({ roles: [role("reader", [READ_EMISSION])] });
    expect(() => requirePermission(reader, "emission", "write")).toThrow(UnauthorizedError);
    try {
      requirePermission(reader, "emission", "write");
    } catch (error) {
      const unauthorized = error as UnauthorizedError;
      expect(unauthorized.code).toBe("UNAUTHORIZED");
      expect(unauthorized.message).toMatch(/Not permitted/);
      expect(unauthorized.details).toMatchObject({
        resource: "emission",
        action: "write",
        userId: "user-1",
        organizationId: ORG,
      });
    }
  });
});

describe("permissionMatrix", () => {
  it("produces a resource x action grid for the UI", () => {
    const editor = session({
      roles: [role("editor", [READ_EMISSION, { resource: "target", action: "*" }])],
    });
    const matrix = permissionMatrix(editor, ["emission", "target"], ["read", "update"]);
    expect(matrix).toEqual({
      emission: { read: true, update: false },
      target: { read: true, update: true },
    });
  });
});
