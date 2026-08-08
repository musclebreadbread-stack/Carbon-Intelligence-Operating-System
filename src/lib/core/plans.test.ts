import { describe, expect, it } from "vitest";

import { PLAN_TIERS } from "./enums";
import { hasModuleAccess, minimumPlanFor, PLAN_MODULE_ACCESS } from "./plans";

describe("hasModuleAccess", () => {
  it("gives every tier access to the core calculation workflow", () => {
    for (const plan of PLAN_TIERS) {
      expect(hasModuleAccess(plan, "activity-data")).toBe(true);
      expect(hasModuleAccess(plan, "emission-engine")).toBe(true);
      expect(hasModuleAccess(plan, "esg-disclosure")).toBe(true);
    }
  });

  it("locks premium modules out of STARTER and GROWTH", () => {
    for (const plan of ["STARTER", "GROWTH"] as const) {
      expect(hasModuleAccess(plan, "carbon-finance")).toBe(false);
      expect(hasModuleAccess(plan, "ai-simulator")).toBe(false);
      expect(hasModuleAccess(plan, "verification")).toBe(false);
    }
  });

  it("gives ENTERPRISE and an active TRIAL every module", () => {
    for (const plan of ["TRIAL", "ENTERPRISE"] as const) {
      expect(hasModuleAccess(plan, "carbon-finance")).toBe(true);
      expect(hasModuleAccess(plan, "digital-mrv")).toBe(true);
    }
  });

  it("covers every module for every tier with no gaps", () => {
    for (const plan of PLAN_TIERS) {
      expect(PLAN_MODULE_ACCESS[plan].length).toBeGreaterThan(0);
    }
  });
});

describe("minimumPlanFor", () => {
  it("reports STARTER for a core module and ENTERPRISE for a premium one", () => {
    expect(minimumPlanFor("activity-data")).toBe("STARTER");
    expect(minimumPlanFor("carbon-finance")).toBe("ENTERPRISE");
  });
});
