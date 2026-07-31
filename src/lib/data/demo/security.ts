/**
 * Demo tenant: users, the RBAC matrix, ABAC policies and API keys.
 *
 * The permission matrix here is the same one the seed writes, so `can()` behaves
 * identically in demo mode and against a real database. No secret material is
 * stored: `passwordHash` is only populated by the seed (item 32) for the offline
 * admin user, and API key hashes are placeholders that cannot authenticate.
 */

import { DEMO_ORGANIZATION_ID } from "./organization";

/** Resource keys the permission matrix covers. */
/**
 * Resources the permission catalogue covers.
 *
 * These names are **the names the server actions enforce**, not a parallel taxonomy.
 * They used to diverge, with real consequences: the catalogue offered `rule`, `credit`
 * and `ai` while `executeRuleSetAction`, `retireCreditsAction` and `runAnalysisAction`
 * check `validation_rule`, `carbon_credit` and `ai_analysis`, and `data_source` and
 * `notification` were absent entirely. Because a `Permission` row for the enforced pair
 * did not exist, no role except the wildcard administrator could ever be granted those
 * capabilities — a sustainability manager holding `credit:create` still could not retire
 * a credit, and nothing anywhere reported why.
 *
 * `src/lib/data/demo/rbac-coverage.test.ts` scans the action modules and fails if an
 * enforced pair has no catalogue entry, so the two cannot drift again.
 */
export const DEMO_RESOURCES = [
  "organization",
  "master_data",
  "activity_data",
  "emission_factor",
  "calculation",
  "validation_rule",
  "target",
  "scenario",
  "roadmap",
  "carbon_credit",
  "disclosure",
  "verification",
  "mrv",
  "ai_analysis",
  "agent",
  "data_source",
  "notification",
  "audit",
  "security",
  "settings",
] as const;
export type DemoResource = (typeof DEMO_RESOURCES)[number];

/**
 * Actions the catalogue covers.
 *
 * `execute` and `retire` are here because the code enforces them: running a rule set is
 * not an `update`, and retiring a carbon credit is irreversible and deliberately not
 * expressible as one either.
 */
export const DEMO_ACTIONS = [
  "read",
  "create",
  "update",
  "delete",
  "approve",
  "export",
  "execute",
  "retire",
] as const;
export type DemoAction = (typeof DEMO_ACTIONS)[number];

export type DemoPermission = {
  readonly id: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string;
};

/** The full cartesian matrix, plus one wildcard per resource for admins. */
export const DEMO_PERMISSIONS: readonly DemoPermission[] = [
  ...DEMO_RESOURCES.flatMap((resource) =>
    DEMO_ACTIONS.map((action) => ({
      id: `demo-perm-${resource}-${action}`,
      resource,
      action,
      description: `${action} on ${resource}`,
    })),
  ),
  {
    id: "demo-perm-wildcard",
    resource: "*",
    action: "*",
    description: "Full administrative access to every resource and action",
  },
];

export type DemoRole = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description: string;
  readonly isSystem: boolean;
  readonly permissionIds: readonly string[];
};

const READ_ALL = DEMO_RESOURCES.map((resource) => `demo-perm-${resource}-read`);

export const DEMO_ROLES: readonly DemoRole[] = [
  {
    id: "demo-role-admin",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "시스템 관리자 (System administrator)",
    description: "Unrestricted access, including security and audit configuration.",
    isSystem: true,
    permissionIds: ["demo-perm-wildcard"],
  },
  {
    id: "demo-role-sustainability-manager",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "지속가능경영 담당자 (Sustainability manager)",
    description: "Runs the inventory, owns targets and disclosure, approves calculations.",
    isSystem: true,
    permissionIds: [
      ...READ_ALL,
      "demo-perm-activity_data-create",
      "demo-perm-activity_data-update",
      "demo-perm-calculation-create",
      "demo-perm-calculation-approve",
      "demo-perm-emission_factor-create",
      "demo-perm-emission_factor-update",
      "demo-perm-target-create",
      "demo-perm-target-update",
      "demo-perm-scenario-create",
      "demo-perm-scenario-update",
      "demo-perm-roadmap-create",
      "demo-perm-roadmap-update",
      "demo-perm-disclosure-create",
      "demo-perm-disclosure-update",
      "demo-perm-disclosure-approve",
      "demo-perm-carbon_credit-create",
      "demo-perm-carbon_credit-update",
      // Retirement is irreversible, so it is granted explicitly rather than implied
      // by `update`.
      "demo-perm-carbon_credit-retire",
      "demo-perm-ai_analysis-create",
      "demo-perm-agent-create",
      "demo-perm-agent-execute",
      "demo-perm-validation_rule-create",
      "demo-perm-validation_rule-update",
      "demo-perm-validation_rule-execute",
      "demo-perm-notification-update",
      "demo-perm-mrv-create",
      "demo-perm-mrv-update",
      "demo-perm-calculation-export",
      "demo-perm-disclosure-export",
    ],
  },
  {
    id: "demo-role-data-analyst",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "데이터 분석가 (Data analyst)",
    description: "Enters and maintains activity data; cannot approve or delete.",
    isSystem: true,
    permissionIds: [
      ...READ_ALL,
      "demo-perm-activity_data-create",
      "demo-perm-activity_data-update",
      "demo-perm-master_data-create",
      "demo-perm-master_data-update",
      "demo-perm-calculation-create",
      "demo-perm-ai_analysis-create",
      "demo-perm-validation_rule-execute",
      "demo-perm-notification-update",
    ],
  },
  {
    id: "demo-role-facility-operator",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "사업장 담당자 (Facility operator)",
    description:
      "Enters activity data for a single facility only; scoped by an ABAC access policy.",
    isSystem: true,
    permissionIds: [
      "demo-perm-activity_data-read",
      "demo-perm-activity_data-create",
      "demo-perm-activity_data-update",
      "demo-perm-mrv-read",
      "demo-perm-organization-read",
      "demo-perm-master_data-read",
      // Every role that can be notified must be able to dismiss its own
      // notifications; the action scopes the update to the session's own user id.
      "demo-perm-notification-read",
      "demo-perm-notification-update",
    ],
  },
  {
    id: "demo-role-verifier",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "검증인 (External verifier)",
    description: "Read-only across the inventory, plus findings management.",
    isSystem: true,
    permissionIds: [
      ...READ_ALL,
      "demo-perm-verification-create",
      "demo-perm-verification-update",
      // Forming the assurance opinion is an approval, not an update.
      "demo-perm-verification-approve",
      "demo-perm-notification-update",
      "demo-perm-audit-export",
    ],
  },
  {
    id: "demo-role-viewer",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "열람자 (Viewer)",
    description: "Read-only dashboards; no access to security or audit configuration.",
    isSystem: true,
    permissionIds: [
      ...READ_ALL.filter(
        (id) => id !== "demo-perm-security-read" && id !== "demo-perm-audit-read",
      ),
      "demo-perm-notification-update",
    ],
  },
];

export type DemoUser = {
  readonly id: string;
  readonly organizationId: string;
  readonly email: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly emailVerified: boolean;
  readonly lastLoginAt: Date | null;
  readonly roleIds: readonly string[];
};

export const DEMO_ADMIN_USER_ID = "demo-user-admin";

export const DEMO_USERS: readonly DemoUser[] = [
  {
    id: DEMO_ADMIN_USER_ID,
    organizationId: DEMO_ORGANIZATION_ID,
    email: "admin@example.com",
    name: "김도현 (Kim Do-hyun) — System administrator",
    isActive: true,
    emailVerified: true,
    lastLoginAt: new Date(Date.UTC(2024, 11, 20, 8, 12)),
    roleIds: ["demo-role-admin", "demo-role-sustainability-manager"],
  },
  {
    id: "demo-user-manager",
    organizationId: DEMO_ORGANIZATION_ID,
    email: "sustainability@example.com",
    name: "이서연 (Lee Seo-yeon) — Sustainability manager",
    isActive: true,
    emailVerified: true,
    lastLoginAt: new Date(Date.UTC(2024, 11, 20, 7, 41)),
    roleIds: ["demo-role-sustainability-manager"],
  },
  {
    id: "demo-user-analyst",
    organizationId: DEMO_ORGANIZATION_ID,
    email: "analyst@example.com",
    name: "박준호 (Park Jun-ho) — Data analyst",
    isActive: true,
    emailVerified: true,
    lastLoginAt: new Date(Date.UTC(2024, 11, 19, 23, 55)),
    roleIds: ["demo-role-data-analyst"],
  },
  {
    id: "demo-user-ulsan-operator",
    organizationId: DEMO_ORGANIZATION_ID,
    email: "ulsan.ops@example.com",
    name: "최민아 (Choi Min-a) — Ulsan facility operator",
    isActive: true,
    emailVerified: true,
    lastLoginAt: new Date(Date.UTC(2024, 11, 20, 0, 5)),
    roleIds: ["demo-role-facility-operator"],
  },
  {
    id: "demo-user-verifier",
    organizationId: DEMO_ORGANIZATION_ID,
    email: "verifier@example.com",
    name: "Park Ji-hoon — Korea Verification Services",
    isActive: true,
    emailVerified: true,
    lastLoginAt: new Date(Date.UTC(2024, 11, 18, 5, 30)),
    roleIds: ["demo-role-verifier"],
  },
];

export type DemoAccessPolicy = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description: string;
  readonly resource: string;
  /**
   * Attribute conditions evaluated with the item-14 rule operators. `field` is
   * resolved against the request attributes the caller supplies.
   */
  readonly conditions: {
    readonly logicGroup: "AND" | "OR";
    readonly rules: readonly {
      readonly field: string;
      readonly operator: string;
      readonly value: string;
    }[];
  };
  readonly effect: "allow" | "deny";
  readonly priority: number;
  readonly isActive: boolean;
  /** Roles the policy applies to; empty means every role. */
  readonly appliesToRoleIds: readonly string[];
};

export const DEMO_ACCESS_POLICIES: readonly DemoAccessPolicy[] = [
  {
    id: "demo-policy-ulsan-only",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "울산 사업장 한정 (Ulsan facility only)",
    description:
      "Facility operators may only touch activity data whose facility is their assigned facility.",
    resource: "activity_data",
    conditions: {
      logicGroup: "AND",
      rules: [{ field: "facilityId", operator: "EQUALS", value: "demo-fac-ulsan" }],
    },
    effect: "allow",
    priority: 100,
    isActive: true,
    appliesToRoleIds: ["demo-role-facility-operator"],
  },
  {
    id: "demo-policy-verifier-readonly-window",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "검증 기간 한정 (Assurance window only)",
    description: "External verifiers may only write findings for the engagement reporting year.",
    resource: "verification",
    conditions: {
      logicGroup: "AND",
      rules: [{ field: "reportingYear", operator: "EQUALS", value: "2024" }],
    },
    effect: "allow",
    priority: 90,
    isActive: true,
    appliesToRoleIds: ["demo-role-verifier"],
  },
  {
    id: "demo-policy-deny-cross-org",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "타 조직 접근 차단 (Deny cross-tenant access)",
    description: "Explicitly denies any request whose organization differs from the session's.",
    resource: "*",
    conditions: {
      logicGroup: "AND",
      rules: [{ field: "organizationId", operator: "NOT_EQUALS", value: DEMO_ORGANIZATION_ID }],
    },
    effect: "deny",
    priority: 1_000,
    isActive: true,
    appliesToRoleIds: [],
  },
];

export type DemoApiKey = {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly name: string;
  readonly prefix: string;
  /** Placeholder digest: no real key hashes to this, so it cannot authenticate. */
  readonly keyHash: string;
  readonly scopes: readonly string[];
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly isActive: boolean;
  /** `APIKey.rateLimit`: requests/minute, `null` = the deployment default. */
  readonly rateLimit: number | null;
};

export const DEMO_API_KEYS: readonly DemoApiKey[] = [
  {
    id: "demo-apikey-reporting",
    organizationId: DEMO_ORGANIZATION_ID,
    userId: DEMO_ADMIN_USER_ID,
    name: "리포팅 통합 (Reporting integration)",
    prefix: "cios_demo_rpt",
    keyHash: "demo-placeholder-hash-reporting",
    scopes: ["calculation:read", "disclosure:read", "activity_data:read"],
    lastUsedAt: new Date(Date.UTC(2024, 11, 20, 4, 22)),
    expiresAt: new Date(Date.UTC(2025, 11, 31)),
    isActive: true,
    // Inherits the deployment default, which is the common case.
    rateLimit: null,
  },
  {
    id: "demo-apikey-ingest",
    organizationId: DEMO_ORGANIZATION_ID,
    userId: "demo-user-analyst",
    name: "활동량 수집 (Activity data ingest)",
    prefix: "cios_demo_ing",
    keyHash: "demo-placeholder-hash-ingest",
    scopes: ["activity_data:read", "activity_data:create"],
    lastUsedAt: new Date(Date.UTC(2024, 11, 20, 18, 3)),
    expiresAt: null,
    isActive: true,
    // A nightly bulk ingest needs more headroom than the 60/min default.
    rateLimit: 600,
  },
  {
    id: "demo-apikey-revoked",
    organizationId: DEMO_ORGANIZATION_ID,
    userId: "demo-user-analyst",
    name: "구 통합 키 (Retired integration key)",
    prefix: "cios_demo_old",
    keyHash: "demo-placeholder-hash-revoked",
    scopes: ["activity_data:read"],
    lastUsedAt: new Date(Date.UTC(2024, 5, 30, 11, 0)),
    expiresAt: new Date(Date.UTC(2024, 6, 1)),
    isActive: false,
    rateLimit: null,
  },
];
