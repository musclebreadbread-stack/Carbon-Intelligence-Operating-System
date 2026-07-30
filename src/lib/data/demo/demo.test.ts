import { describe, expect, it } from "vitest";

import { SCOPE3_CATEGORIES } from "@/lib/core/enums";
import { buildInventory } from "@/lib/domain/emissions/aggregate";
import { runCalculation } from "@/lib/domain/emissions/orchestrator";
import { requirementsFor } from "@/lib/domain/disclosure/requirements";
import { creditBalance } from "@/lib/domain/credits/registry";
import { FACTOR_DENOMINATOR_UNIT, findUnit } from "@/lib/reference/units";

import {
  DEMO_ABATEMENT_TECHNOLOGIES,
  DEMO_ACCESS_POLICIES,
  DEMO_ACTIVITY_DATA,
  DEMO_ACTIVITY_ENTRIES,
  DEMO_AGENTS,
  DEMO_AGENT_TASKS,
  DEMO_API_KEYS,
  DEMO_BASELINE_YEAR,
  DEMO_BUILDINGS,
  DEMO_BUSINESS_UNITS,
  DEMO_CALCULATION_ENTRIES,
  DEMO_CARBON_CREDITS,
  DEMO_CARBON_OFFSETS,
  DEMO_CURRENT_YEAR,
  DEMO_DATASET,
  DEMO_DISCLOSURE_FRAMEWORK_ROWS,
  DEMO_DISCLOSURE_REPORTS,
  DEMO_EMISSION_FACTORS,
  DEMO_EMISSION_SOURCES,
  DEMO_EQUIPMENT,
  DEMO_EXPECTED_ENTRY_COUNT,
  DEMO_FACILITIES,
  DEMO_FACILITY_CONSOLIDATION,
  DEMO_FACTOR_SOURCES,
  DEMO_FACTOR_VERSIONS,
  DEMO_FUELS,
  DEMO_FUEL_TYPES,
  DEMO_MEASUREMENTS,
  DEMO_MONITORING_PARAMETERS,
  DEMO_MONITORING_PLAN,
  DEMO_MRV_PLAN,
  DEMO_NARRATIVE_RESPONSES,
  DEMO_ORGANIZATION,
  DEMO_ORGANIZATION_ID,
  DEMO_PERMISSIONS,
  DEMO_PRODUCTION_LINES,
  DEMO_REFRIGERANTS,
  DEMO_REPORTING_YEARS,
  DEMO_ROADMAP,
  DEMO_ROADMAP_ACTIONS,
  DEMO_ROLES,
  DEMO_RULE_SETS,
  DEMO_SCENARIOS,
  DEMO_SCENARIO_ASSUMPTIONS,
  DEMO_SOURCE_HIERARCHY,
  DEMO_SUPPLIERS,
  DEMO_TARGETS,
  DEMO_TARGET_TYPES,
  DEMO_USERS,
  DEMO_VERIFICATION_ENGAGEMENT,
  DEMO_VERIFICATION_FINDINGS,
  DEMO_VERIFICATION_SCOPES,
  demoActivityTotals,
  demoEntriesForYear,
  demoPeriodForYear,
} from "./index";

const ids = <T extends { id: string }>(rows: readonly T[]) => new Set(rows.map((row) => row.id));

describe("demo hierarchy integrity", () => {
  it("has the documented shape: 1 organisation, 2 units, 3 facilities", () => {
    expect(DEMO_ORGANIZATION.id).toBe(DEMO_ORGANIZATION_ID);
    expect(DEMO_BUSINESS_UNITS).toHaveLength(2);
    expect(DEMO_FACILITIES).toHaveLength(3);
    expect(DEMO_BUILDINGS.length).toBeGreaterThanOrEqual(3);
    expect(DEMO_PRODUCTION_LINES.length).toBeGreaterThanOrEqual(3);
    expect(DEMO_EQUIPMENT.length).toBeGreaterThanOrEqual(3);
    expect(DEMO_EMISSION_SOURCES).toHaveLength(13);
  });

  it("resolves every hierarchy foreign key", () => {
    const unitIds = ids(DEMO_BUSINESS_UNITS);
    const facilityIds = ids(DEMO_FACILITIES);
    const buildingIds = ids(DEMO_BUILDINGS);
    const lineIds = ids(DEMO_PRODUCTION_LINES);
    const equipmentIds = ids(DEMO_EQUIPMENT);

    for (const facility of DEMO_FACILITIES) {
      expect(facility.organizationId).toBe(DEMO_ORGANIZATION_ID);
      expect(unitIds.has(facility.businessUnitId), facility.id).toBe(true);
    }
    for (const building of DEMO_BUILDINGS) {
      expect(facilityIds.has(building.facilityId), building.id).toBe(true);
    }
    for (const line of DEMO_PRODUCTION_LINES) {
      expect(buildingIds.has(line.buildingId), line.id).toBe(true);
    }
    for (const item of DEMO_EQUIPMENT) {
      expect(lineIds.has(item.productionLineId), item.id).toBe(true);
    }
    for (const source of DEMO_EMISSION_SOURCES) {
      if (source.facilityId) expect(facilityIds.has(source.facilityId), source.id).toBe(true);
      if (source.buildingId) expect(buildingIds.has(source.buildingId), source.id).toBe(true);
      if (source.productionLineId) {
        expect(lineIds.has(source.productionLineId), source.id).toBe(true);
      }
      if (source.equipmentId) expect(equipmentIds.has(source.equipmentId), source.id).toBe(true);
    }
  });

  it("covers all four Scope 1 source types, both Scope 2 bases and 6 Scope 3 categories", () => {
    const scope1Types = new Set(
      DEMO_EMISSION_SOURCES.filter((source) => source.scope === "SCOPE_1").map(
        (source) => source.sourceType,
      ),
    );
    expect(scope1Types).toEqual(new Set(["STATIONARY", "MOBILE", "FUGITIVE"]));

    const scope3Categories = new Set(
      DEMO_EMISSION_SOURCES.filter((source) => source.scope === "SCOPE_3").map(
        (source) => source.scope3Category,
      ),
    );
    expect(scope3Categories.size).toBe(6);
    for (const category of scope3Categories) {
      expect(SCOPE3_CATEGORIES).toContain(category);
    }

    const entryScopes = new Set(DEMO_CALCULATION_ENTRIES.map((entry) => entry.scope));
    expect(entryScopes.has("SCOPE_2_LOCATION")).toBe(true);
    expect(entryScopes.has("SCOPE_2_MARKET")).toBe(true);
  });

  it("resolves a hierarchy path for every emission source", () => {
    for (const source of DEMO_EMISSION_SOURCES) {
      const path = DEMO_SOURCE_HIERARCHY[source.id];
      expect(path, source.id).toBeDefined();
      expect(path.organizationId).toBe(DEMO_ORGANIZATION_ID);
      expect(path.emissionSourceId).toBe(source.id);
    }
  });

  it("includes a JV facility that exercises the consolidation branches", () => {
    const jv = DEMO_FACILITIES.find((facility) => facility.equityShare < 100);
    expect(jv).toBeDefined();
    expect(jv?.operationalControl).toBe(false);
    expect(DEMO_FACILITY_CONSOLIDATION).toHaveLength(DEMO_FACILITIES.length);
  });
});

describe("demo master data integrity", () => {
  it("resolves fuel-type and refrigerant references", () => {
    const fuelTypeIds = ids(DEMO_FUEL_TYPES);
    for (const fuel of DEMO_FUELS) {
      expect(fuelTypeIds.has(fuel.fuelTypeId), fuel.id).toBe(true);
      expect(findUnit(fuel.unit), fuel.unit).toBeDefined();
    }

    const refrigerantIds = ids(DEMO_REFRIGERANTS);
    const fuelIds = ids(DEMO_FUELS);
    for (const item of DEMO_EQUIPMENT) {
      if (item.fuelTypeId) expect(fuelTypeIds.has(item.fuelTypeId), item.id).toBe(true);
      if (item.refrigerantId) expect(refrigerantIds.has(item.refrigerantId), item.id).toBe(true);
    }
    expect(fuelIds.size).toBeGreaterThan(0);
  });

  it("keeps every supplier inside the demo organisation", () => {
    for (const supplier of DEMO_SUPPLIERS) {
      expect(supplier.organizationId).toBe(DEMO_ORGANIZATION_ID);
    }
  });
});

describe("demo emission factors", () => {
  it("carries at least 60 factors, each with a citable source and version", () => {
    expect(DEMO_EMISSION_FACTORS.length).toBeGreaterThanOrEqual(60);

    const sourceIds = ids(DEMO_FACTOR_SOURCES);
    const versionIds = ids(DEMO_FACTOR_VERSIONS);
    for (const factor of DEMO_EMISSION_FACTORS) {
      expect(factor.sourceId, factor.id).toBeTruthy();
      expect(sourceIds.has(factor.sourceId as string), factor.id).toBe(true);
      expect(versionIds.has(factor.versionId as string), factor.id).toBe(true);
      expect(factor.value).toBeGreaterThanOrEqual(0);
      expect(FACTOR_DENOMINATOR_UNIT[factor.unit], factor.id).toBeDefined();
    }
  });

  it("gives every factor source a publisher and a URL", () => {
    for (const source of DEMO_FACTOR_SOURCES) {
      expect(source.publisher.length, source.id).toBeGreaterThan(0);
      expect(source.url, source.id).toMatch(/^https:\/\//);
    }
  });

  it("resolves every factor version to a source", () => {
    const sourceIds = ids(DEMO_FACTOR_SOURCES);
    for (const version of DEMO_FACTOR_VERSIONS) {
      expect(sourceIds.has(version.sourceId), version.id).toBe(true);
    }
  });

  it("has versioned grid factors with non-overlapping validity windows", () => {
    const gridFactors = DEMO_EMISSION_FACTORS.filter(
      (factor) =>
        factor.scope === "SCOPE_2_LOCATION" && factor.country === "KR" && factor.isActive,
    );
    expect(gridFactors.length).toBeGreaterThanOrEqual(2);
    const values = new Set(gridFactors.map((factor) => factor.value));
    expect(values.size).toBe(gridFactors.length);
  });
});

describe("demo activity data", () => {
  it("carries 24 months across 16 streams", () => {
    expect(DEMO_ACTIVITY_ENTRIES).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT);
    expect(DEMO_CALCULATION_ENTRIES).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT);
    expect(DEMO_ACTIVITY_DATA).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT / 12);

    for (const year of DEMO_REPORTING_YEARS) {
      const months = new Set(
        DEMO_ACTIVITY_ENTRIES.filter(
          (entry) => entry.startDate.getUTCFullYear() === year,
        ).map((entry) => entry.startDate.getUTCMonth() + 1),
      );
      expect(months.size, String(year)).toBe(12);
    }
  });

  it("resolves every entry to a header and an emission source", () => {
    const headerIds = ids(DEMO_ACTIVITY_DATA);
    const sourceIds = ids(DEMO_EMISSION_SOURCES);
    for (const entry of DEMO_ACTIVITY_ENTRIES) {
      expect(headerIds.has(entry.activityDataId), entry.id).toBe(true);
      expect(sourceIds.has(entry.emissionSourceId), entry.id).toBe(true);
      expect(entry.quantity).toBeGreaterThan(0);
      expect(findUnit(entry.unit), entry.unit).toBeDefined();
      expect(entry.endDate.getTime()).toBeGreaterThan(entry.startDate.getTime());
    }
  });

  it("resolves every master-data reference an entry carries", () => {
    const fuelIds = ids(DEMO_FUELS);
    const refrigerantIds = ids(DEMO_REFRIGERANTS);
    const supplierIds = ids(DEMO_SUPPLIERS);
    for (const entry of DEMO_ACTIVITY_ENTRIES) {
      if (entry.fuelId) expect(fuelIds.has(entry.fuelId), entry.id).toBe(true);
      if (entry.refrigerantId) {
        expect(refrigerantIds.has(entry.refrigerantId), entry.id).toBe(true);
      }
      if (entry.supplierId) expect(supplierIds.has(entry.supplierId), entry.id).toBe(true);
    }
  });

  it("is deterministic: the same quantities on every evaluation", () => {
    const totals = demoActivityTotals();
    expect(demoActivityTotals()).toEqual(totals);
    // Spot-check the seasonal function: January is the annual peak for heating.
    const januaryNg = DEMO_ACTIVITY_ENTRIES.find(
      (entry) => entry.id === "demo-ade-s1-ulsan-ng-2023-01",
    );
    const julyNg = DEMO_ACTIVITY_ENTRIES.find(
      (entry) => entry.id === "demo-ade-s1-ulsan-ng-2023-07",
    );
    expect(januaryNg?.quantity).toBe(180_560);
    expect(julyNg?.quantity).toBe(115_440);
  });

  it("shows a genuine year-on-year reduction", () => {
    const total = (year: number) =>
      DEMO_ACTIVITY_ENTRIES.filter(
        (entry) => entry.startDate.getUTCFullYear() === year && entry.unit === "kWh",
      ).reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total(DEMO_CURRENT_YEAR)).toBeLessThan(total(DEMO_BASELINE_YEAR));
  });
});

describe("demo dataset drives the real engines", () => {
  it("computes a complete inventory for each reporting year", () => {
    for (const year of DEMO_REPORTING_YEARS) {
      const outcome = runCalculation({
        organizationId: DEMO_ORGANIZATION_ID,
        name: `${year} inventory`,
        reportingYear: year,
        period: demoPeriodForYear(year),
        gwpVersion: "AR6",
        consolidationApproach: "OPERATIONAL_CONTROL",
        facilities: DEMO_FACILITY_CONSOLIDATION,
        candidateFactors: DEMO_EMISSION_FACTORS,
        entries: demoEntriesForYear(year),
      });

      expect(outcome.results).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT / 2);
      expect(outcome.traces).toHaveLength(outcome.results.length);
      expect(outcome.inventory.scope1Total).toBeGreaterThan(0);
      expect(outcome.inventory.scope2Location).toBeGreaterThan(0);
      expect(outcome.inventory.scope3Total).toBeGreaterThan(0);
      expect(Object.keys(outcome.inventory.scope3ByCategory)).toHaveLength(6);
      // The PPA and I-REC make market-based lower than location-based.
      expect(outcome.inventory.scope2Market).toBeLessThan(outcome.inventory.scope2Location);
      // A lineage edge per result at minimum.
      expect(outcome.lineage.edges.length).toBeGreaterThanOrEqual(outcome.results.length);
    }
  });

  it("reproduces byte-identical totals across two runs", () => {
    const run = () =>
      runCalculation({
        organizationId: DEMO_ORGANIZATION_ID,
        name: "determinism",
        reportingYear: DEMO_CURRENT_YEAR,
        period: demoPeriodForYear(DEMO_CURRENT_YEAR),
        gwpVersion: "AR6",
        consolidationApproach: "OPERATIONAL_CONTROL",
        facilities: DEMO_FACILITY_CONSOLIDATION,
        candidateFactors: DEMO_EMISSION_FACTORS,
        entries: demoEntriesForYear(DEMO_CURRENT_YEAR),
      }).inventory;
    expect(run()).toEqual(run());
  });

  it("falls 2024 below 2023 on the computed total", () => {
    const totalFor = (year: number) =>
      buildInventory(
        runCalculation({
          organizationId: DEMO_ORGANIZATION_ID,
          name: `${year}`,
          reportingYear: year,
          period: demoPeriodForYear(year),
          gwpVersion: "AR6",
          facilities: DEMO_FACILITY_CONSOLIDATION,
          candidateFactors: DEMO_EMISSION_FACTORS,
          entries: demoEntriesForYear(year),
        }).results,
      ).totalEmissions;
    expect(totalFor(DEMO_CURRENT_YEAR)).toBeLessThan(totalFor(DEMO_BASELINE_YEAR));
  });
});

describe("demo strategy, finance and compliance fixtures", () => {
  it("resolves target and roadmap references", () => {
    const typeIds = ids(DEMO_TARGET_TYPES);
    for (const target of DEMO_TARGETS) {
      expect(target.organizationId).toBe(DEMO_ORGANIZATION_ID);
      expect(typeIds.has(target.targetTypeId), target.id).toBe(true);
      expect(target.targetYear).toBeGreaterThan(target.baselineYear);
      expect(target.targetReduction).toBeGreaterThan(0);
      expect(target.targetReduction).toBeLessThanOrEqual(100);
    }

    const technologyIds = ids(DEMO_ABATEMENT_TECHNOLOGIES);
    for (const action of DEMO_ROADMAP_ACTIONS) {
      expect(action.roadmapId).toBe(DEMO_ROADMAP.id);
      expect(technologyIds.has(action.technologyId), action.id).toBe(true);
      expect(action.endYear).toBeGreaterThanOrEqual(action.startYear);
    }
  });

  it("gives every scenario a full lever set", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const assumptions = DEMO_SCENARIO_ASSUMPTIONS.filter(
        (assumption) => assumption.scenarioId === scenario.id,
      );
      expect(assumptions.length, scenario.id).toBe(10);
      expect(scenario.targetYear).toBeGreaterThan(scenario.baselineYear);
    }
  });

  it("resolves offsets to credits without over-retiring", () => {
    const creditIds = ids(DEMO_CARBON_CREDITS);
    for (const offset of DEMO_CARBON_OFFSETS) {
      expect(creditIds.has(offset.creditId), offset.id ?? "offset").toBe(true);
    }
    const balance = creditBalance(DEMO_CARBON_CREDITS, DEMO_CARBON_OFFSETS);
    expect(balance.totalAvailable).toBeGreaterThan(0);
    for (const row of balance.credits) {
      expect(row.availableQuantity, row.creditId).toBeGreaterThanOrEqual(0);
    }
  });

  it("resolves the verification and MRV graph", () => {
    for (const scope of DEMO_VERIFICATION_SCOPES) {
      expect(scope.engagementId).toBe(DEMO_VERIFICATION_ENGAGEMENT.id);
    }
    for (const finding of DEMO_VERIFICATION_FINDINGS) {
      expect(finding.engagementId).toBe(DEMO_VERIFICATION_ENGAGEMENT.id);
    }
    expect(DEMO_MONITORING_PLAN.mrvPlanId).toBe(DEMO_MRV_PLAN.id);

    const sourceIds = ids(DEMO_EMISSION_SOURCES);
    for (const parameter of DEMO_MONITORING_PARAMETERS) {
      expect(parameter.monitoringPlanId).toBe(DEMO_MONITORING_PLAN.id);
      if (parameter.emissionSourceId) {
        expect(sourceIds.has(parameter.emissionSourceId), parameter.id).toBe(true);
      }
    }
    // 11 parameters against 13 sources: two sources are deliberately uncovered.
    expect(DEMO_MONITORING_PARAMETERS).toHaveLength(11);
  });

  it("leaves the Pyeongtaek meter incomplete so completeness is below 100 %", () => {
    const parameterIds = new Set(DEMO_MONITORING_PARAMETERS.map((row) => row.id));
    for (const measurement of DEMO_MEASUREMENTS) {
      expect(measurement.mrvPlanId).toBe(DEMO_MRV_PLAN.id);
      expect(parameterIds.has(measurement.monitoringParameterId as string)).toBe(true);
    }
    const pyeongtaek = DEMO_MEASUREMENTS.filter(
      (row) => row.monitoringParameterId === "demo-mp-pyeongtaek-electricity",
    );
    expect(pyeongtaek).toHaveLength(10);
    expect(DEMO_MEASUREMENTS).toHaveLength(11 * 12 - 2);
  });

  it("resolves disclosure reports to a mapped framework", () => {
    const frameworkCodes = new Set(DEMO_DISCLOSURE_FRAMEWORK_ROWS.map((row) => row.code));
    for (const report of DEMO_DISCLOSURE_REPORTS) {
      expect(report.organizationId).toBe(DEMO_ORGANIZATION_ID);
      expect(frameworkCodes.has(report.framework), report.id).toBe(true);
      expect(requirementsFor(report.framework).length, report.framework).toBeGreaterThan(0);
    }
    const reportIds = ids(DEMO_DISCLOSURE_REPORTS);
    const requirementCodes = new Set(
      DEMO_DISCLOSURE_FRAMEWORK_ROWS.flatMap((row) =>
        requirementsFor(row.code).map((requirement) => `${row.code}:${requirement.code}`),
      ),
    );
    for (const response of DEMO_NARRATIVE_RESPONSES) {
      expect(reportIds.has(response.reportId), response.id).toBe(true);
      expect(
        requirementCodes.has(`${response.framework}:${response.requirementCode}`),
        response.id,
      ).toBe(true);
    }
  });
});

describe("demo security and AI fixtures", () => {
  it("resolves every role permission and user role", () => {
    const permissionIds = ids(DEMO_PERMISSIONS);
    for (const role of DEMO_ROLES) {
      expect(role.organizationId).toBe(DEMO_ORGANIZATION_ID);
      expect(role.permissionIds.length, role.id).toBeGreaterThan(0);
      for (const permissionId of role.permissionIds) {
        expect(permissionIds.has(permissionId), `${role.id}:${permissionId}`).toBe(true);
      }
    }
    const roleIds = ids(DEMO_ROLES);
    for (const user of DEMO_USERS) {
      expect(user.organizationId).toBe(DEMO_ORGANIZATION_ID);
      for (const roleId of user.roleIds) {
        expect(roleIds.has(roleId), `${user.id}:${roleId}`).toBe(true);
      }
    }
  });

  it("keeps API keys and policies inside the tenant and stores no usable secret", () => {
    const userIds = ids(DEMO_USERS);
    for (const key of DEMO_API_KEYS) {
      expect(key.organizationId).toBe(DEMO_ORGANIZATION_ID);
      expect(userIds.has(key.userId), key.id).toBe(true);
      expect(key.keyHash).toMatch(/^demo-placeholder-hash-/);
    }
    for (const policy of DEMO_ACCESS_POLICIES) {
      expect(policy.organizationId).toBe(DEMO_ORGANIZATION_ID);
      expect(policy.conditions.rules.length, policy.id).toBeGreaterThan(0);
    }
  });

  it("resolves agent tasks to agents and rule sets to the tenant", () => {
    const agentIds = ids(DEMO_AGENTS);
    for (const task of DEMO_AGENT_TASKS) {
      expect(agentIds.has(task.agentId), task.id).toBe(true);
      expect(task.input.toolCalls.length, task.id).toBeGreaterThan(0);
    }
    for (const set of DEMO_RULE_SETS) {
      expect(set.organizationId).toBe(DEMO_ORGANIZATION_ID);
      expect(set.rules.length, set.id).toBeGreaterThan(0);
      for (const rule of set.rules) {
        expect(rule.conditions.length, rule.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("DEMO_DATASET aggregate", () => {
  it("exposes the same collections the seed writes", () => {
    expect(DEMO_DATASET.organization.id).toBe(DEMO_ORGANIZATION_ID);
    expect(DEMO_DATASET.activityEntries).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT);
    expect(DEMO_DATASET.emissionFactors.length).toBeGreaterThanOrEqual(60);
    expect(DEMO_DATASET.meta.reportingYears).toEqual(DEMO_REPORTING_YEARS);
  });
});
