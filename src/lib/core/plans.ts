/**
 * Commercial plan tiers and which dashboard modules each one unlocks.
 *
 * v1 scope decision (see the commercialisation plan): Scope 1/2/3 activity
 * data, calculation and basic disclosure ship in every paid tier from day
 * one. Carbon finance, the AI tools, third-party verification and digital
 * MRV are gated to ENTERPRISE until they have paying demand — cheaper to
 * launch narrow and widen than to build everything before the first sale.
 *
 * Pure TypeScript — no framework, database or network imports, so `plan-gate`
 * (a client component) and server pages can both call `hasModuleAccess`
 * without pulling in Prisma.
 */

import type { PlanTier } from "./enums";

export type ModuleKey =
  | "dashboard"
  | "activity-data"
  | "emission-engine"
  | "emission-factors"
  | "master-data"
  | "esg-disclosure"
  | "organization"
  | "security"
  | "settings"
  | "analytics"
  | "carbon-finance"
  | "ai-engine"
  | "ai-simulator"
  | "ai-roadmap"
  | "ai-agents"
  | "verification"
  | "digital-mrv"
  | "api-gateway";

/** Modules every paid tier — including an active trial — can use. */
const CORE_MODULES: readonly ModuleKey[] = [
  "dashboard",
  "activity-data",
  "emission-engine",
  "emission-factors",
  "master-data",
  "esg-disclosure",
  "organization",
  "security",
  "settings",
  "analytics",
];

/** Modules reserved for ENTERPRISE until a lower tier buys them. */
const PREMIUM_MODULES: readonly ModuleKey[] = [
  "carbon-finance",
  "ai-engine",
  "ai-simulator",
  "ai-roadmap",
  "ai-agents",
  "verification",
  "digital-mrv",
  "api-gateway",
];

export const PLAN_MODULE_ACCESS: Readonly<Record<PlanTier, readonly ModuleKey[]>> = {
  TRIAL: [...CORE_MODULES, ...PREMIUM_MODULES],
  STARTER: CORE_MODULES,
  GROWTH: CORE_MODULES,
  ENTERPRISE: [...CORE_MODULES, ...PREMIUM_MODULES],
};

/**
 * Whether `plan` may use `module`. A trial gets full access, so a prospect
 * evaluates the whole product rather than just what they'd buy at the lowest
 * tier. `Organization.trialEndsAt` is advisory only in v1 — nothing here
 * revokes access automatically when it passes; the operator converts or
 * closes out stale trials manually (scripts/activate-plan.ts).
 */
export function hasModuleAccess(plan: PlanTier, module: ModuleKey): boolean {
  return PLAN_MODULE_ACCESS[plan].includes(module);
}

/** The lowest tier that unlocks `module`, for the upgrade prompt's copy. */
export function minimumPlanFor(module: ModuleKey): PlanTier {
  return PREMIUM_MODULES.includes(module) ? "ENTERPRISE" : "STARTER";
}
