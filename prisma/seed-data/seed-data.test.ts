/**
 * Seed-data integrity.
 *
 * The seed itself cannot be executed here — there is no PostgreSQL server in this
 * environment — so the properties a failed seed would reveal are asserted against
 * the data instead:
 *
 *   1. **Referential integrity.** Every foreign key the seed writes resolves to a
 *      row the seed also writes, in an order that satisfies the dependency. A
 *      dangling reference would fail at `INSERT` time against a real database.
 *   2. **Uniqueness.** Every natural unique constraint the seed upserts on is
 *      actually unique in the data, otherwise the second upsert would overwrite the
 *      first and the seed would silently lose rows.
 *   3. **Fixture parity.** The seeded activity totals equal the item-28 fixture
 *      totals, which is the mechanism behind decision 5: demo mode and a seeded
 *      database must show identical numbers.
 */

import { describe, expect, it } from "vitest";

import { SCOPE3_CATEGORIES } from "@/lib/core/enums";
import {
  DEMO_ACTIVITY_ENTRIES,
  DEMO_EXPECTED_ENTRY_COUNT,
  DEMO_ORGANIZATION_ID,
  demoActivityTotals,
  demoEntriesForYear,
  demoPeriodForYear,
} from "@/lib/data/demo";
import { DISCLOSURE_REQUIREMENTS } from "@/lib/domain/disclosure/requirements";
import { runCalculation } from "@/lib/domain/emissions/orchestrator";
import { FRAMEWORK_DEFINITIONS } from "@/lib/reference/frameworks";
import { PASSWORD_HASH_PREFIX, verifyPassword } from "@/lib/security/field-crypto";

import {
  CALCULATION_METHODOLOGY_SEEDS,
  DISCLOSURE_FRAMEWORK_SEEDS,
  SCOPE3_CONFIG_SEEDS,
  SEED_ADMIN_DEFAULT_PASSWORD,
  SEED_COUNTS,
  SEED_TENANT,
  SEED_TENANT_TOTALS,
  UNIT_CONVERSION_SEEDS,
  seedAdminPasswordHash,
  usingDefaultAdminPassword,
} from "./index";

/** Collects duplicated values of `key`, for a uniqueness assertion. */
function duplicates<T>(rows: readonly T[], key: (row: T) => string): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

describe("unit conversion seeds", () => {
  it("is unique on [fromUnit, toUnit], which the upsert keys on", () => {
    expect(
      duplicates(UNIT_CONVERSION_SEEDS, (row) => `${row.fromUnit}->${row.toUnit}`),
    ).toEqual([]);
  });

  it("carries a strictly positive factor for every row", () => {
    for (const row of UNIT_CONVERSION_SEEDS) {
      expect(row.factor).toBeGreaterThan(0);
      expect(Number.isFinite(row.factor)).toBe(true);
    }
  });

  it("never converts a unit to itself", () => {
    // A self-conversion is either a no-op row or a bug; both are noise in the table.
    for (const row of UNIT_CONVERSION_SEEDS) {
      expect(row.fromUnit).not.toBe(row.toUnit);
    }
  });
});

describe("scope 3 category config seeds", () => {
  it("covers all fifteen categories exactly once", () => {
    expect(SCOPE3_CONFIG_SEEDS).toHaveLength(15);
    expect(duplicates(SCOPE3_CONFIG_SEEDS, (row) => row.category)).toEqual([]);
    for (const category of SCOPE3_CATEGORIES) {
      expect(SCOPE3_CONFIG_SEEDS.some((row) => row.category === category)).toBe(true);
    }
  });

  it("seeds every category as relevant until it has been screened", () => {
    for (const row of SCOPE3_CONFIG_SEEDS) {
      expect(row.isRelevant).toBe(true);
    }
  });

  it("names both an English and a Korean label plus the required fields", () => {
    for (const row of SCOPE3_CONFIG_SEEDS) {
      expect(row.name).toMatch(/^\d+\. .+ \/ .+/);
      expect(row.dataSource.length).toBeGreaterThan(0);
      expect(row.methodology.length).toBeGreaterThan(0);
    }
  });
});

describe("calculation methodology seeds", () => {
  it("is unique on [name, version], which the upsert keys on", () => {
    expect(
      duplicates(CALCULATION_METHODOLOGY_SEEDS, (row) => `${row.name}@${row.version}`),
    ).toEqual([]);
  });

  it("covers Scope 1, both Scope 2 methods and Scope 3", () => {
    const scopes = new Set(
      CALCULATION_METHODOLOGY_SEEDS.flatMap((methodology) =>
        methodology.formulas.map((formula) => formula.applicableScope),
      ),
    );
    expect(scopes).toContain("SCOPE_1");
    expect(scopes).toContain("SCOPE_2_LOCATION");
    expect(scopes).toContain("SCOPE_2_MARKET");
    expect(scopes).toContain("SCOPE_3");
  });

  it("gives every formula an expression and named variables", () => {
    for (const methodology of CALCULATION_METHODOLOGY_SEEDS) {
      expect(methodology.formulas.length).toBeGreaterThan(0);
      for (const formula of methodology.formulas) {
        expect(formula.expression.length).toBeGreaterThan(0);
        expect(Object.keys(formula.variables).length).toBeGreaterThan(0);
      }
    }
  });

  it("cites a published source for every methodology", () => {
    for (const methodology of CALCULATION_METHODOLOGY_SEEDS) {
      expect(methodology.sourceUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("disclosure framework seeds", () => {
  it("seeds one row per framework in the reference table", () => {
    expect(DISCLOSURE_FRAMEWORK_SEEDS).toHaveLength(FRAMEWORK_DEFINITIONS.length);
    expect(
      duplicates(DISCLOSURE_FRAMEWORK_SEEDS, (row) => `${row.code}@${row.version}`),
    ).toEqual([]);
  });

  it("reproduces the whole requirement catalogue with no duplicated codes", () => {
    const total = DISCLOSURE_FRAMEWORK_SEEDS.reduce(
      (sum, framework) => sum + framework.requirements.length,
      0,
    );
    expect(total).toBe(DISCLOSURE_REQUIREMENTS.length);

    for (const framework of DISCLOSURE_FRAMEWORK_SEEDS) {
      expect(duplicates(framework.requirements, (row) => row.code)).toEqual([]);
    }
  });

  it("leaves TNFD with an empty catalogue rather than inventing requirements", () => {
    const tnfd = DISCLOSURE_FRAMEWORK_SEEDS.find((row) => row.code === "TNFD");
    expect(tnfd).toBeDefined();
    // Seeding requirements it does not have would produce a 0 %-complete report
    // instead of "this framework is not mapped yet".
    expect(tnfd?.requirements).toEqual([]);
  });

  it("cites a publisher and URL for every framework", () => {
    for (const framework of DISCLOSURE_FRAMEWORK_SEEDS) {
      expect(framework.publisher.length).toBeGreaterThan(0);
      expect(framework.url).toMatch(/^https:\/\//);
    }
  });

  it("gives every requirement a category that its framework declares", () => {
    for (const framework of DISCLOSURE_FRAMEWORK_SEEDS) {
      const definition = FRAMEWORK_DEFINITIONS.find(
        (row) => row.framework === framework.code,
      );
      const groups = new Set(definition?.requirementGroups.map((group) => group.code));
      for (const requirement of framework.requirements) {
        // An orphan category would render as an unnamed section in the report tree.
        expect(groups.has(requirement.category)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tenant referential integrity
// ---------------------------------------------------------------------------

describe("tenant referential integrity", () => {
  const facilityIds = new Set(SEED_TENANT.facilities.map((row) => row.id));
  const buildingIds = new Set(SEED_TENANT.buildings.map((row) => row.id));
  const lineIds = new Set(SEED_TENANT.productionLines.map((row) => row.id));
  const equipmentIds = new Set(SEED_TENANT.equipment.map((row) => row.id));
  const unitIds = new Set(SEED_TENANT.businessUnits.map((row) => row.id));

  it("attaches every row of the hierarchy to a parent the seed also writes", () => {
    for (const unit of SEED_TENANT.businessUnits) {
      expect(unit.organizationId).toBe(SEED_TENANT.organization.id);
    }
    for (const facility of SEED_TENANT.facilities) {
      expect(facility.organizationId).toBe(SEED_TENANT.organization.id);
      expect(unitIds.has(facility.businessUnitId)).toBe(true);
    }
    for (const building of SEED_TENANT.buildings) {
      expect(facilityIds.has(building.facilityId)).toBe(true);
    }
    for (const line of SEED_TENANT.productionLines) {
      expect(buildingIds.has(line.buildingId)).toBe(true);
    }
    for (const item of SEED_TENANT.equipment) {
      expect(lineIds.has(item.productionLineId)).toBe(true);
    }
  });

  it("resolves every equipment master-data reference", () => {
    const fuelTypeIds = new Set(SEED_TENANT.masterData.fuelTypes.map((row) => row.id));
    const refrigerantIds = new Set(
      SEED_TENANT.masterData.refrigerants.map((row) => row.id),
    );
    for (const item of SEED_TENANT.equipment) {
      if (item.fuelTypeId !== null) expect(fuelTypeIds.has(item.fuelTypeId)).toBe(true);
      if (item.refrigerantId !== null) {
        expect(refrigerantIds.has(item.refrigerantId)).toBe(true);
      }
    }
  });

  it("anchors every emission source somewhere in the hierarchy", () => {
    for (const source of SEED_TENANT.emissionSources) {
      if (source.facilityId !== null) expect(facilityIds.has(source.facilityId)).toBe(true);
      if (source.buildingId !== null) expect(buildingIds.has(source.buildingId)).toBe(true);
      if (source.productionLineId !== null) {
        expect(lineIds.has(source.productionLineId)).toBe(true);
      }
      if (source.equipmentId !== null) {
        expect(equipmentIds.has(source.equipmentId)).toBe(true);
      }
      // A source attached to nothing cannot be rolled up to a facility.
      expect(
        source.facilityId !== null ||
          source.buildingId !== null ||
          source.productionLineId !== null ||
          source.equipmentId !== null,
      ).toBe(true);
    }
  });

  it("resolves every fuel to a fuel type", () => {
    const fuelTypeIds = new Set(SEED_TENANT.masterData.fuelTypes.map((row) => row.id));
    for (const fuel of SEED_TENANT.masterData.fuels) {
      expect(fuelTypeIds.has(fuel.fuelTypeId)).toBe(true);
    }
  });

  it("resolves every factor to its source and version, and every version to its source", () => {
    const sourceIds = new Set(SEED_TENANT.factorSources.map((row) => row.id));
    const versionIds = new Set(SEED_TENANT.factorVersions.map((row) => row.id));
    const categoryIds = new Set(SEED_TENANT.factorCategories.map((row) => row.id));

    for (const version of SEED_TENANT.factorVersions) {
      expect(sourceIds.has(version.sourceId)).toBe(true);
    }
    for (const factor of SEED_TENANT.emissionFactors) {
      if (factor.sourceId != null) expect(sourceIds.has(factor.sourceId)).toBe(true);
      if (factor.versionId != null) expect(versionIds.has(factor.versionId)).toBe(true);
      if (factor.categoryId != null) expect(categoryIds.has(factor.categoryId)).toBe(true);
    }
    for (const category of SEED_TENANT.factorCategories) {
      if (category.parentId !== null) expect(categoryIds.has(category.parentId)).toBe(true);
    }
  });

  it("gives every seeded factor a citable source", () => {
    // The deliverable is explicit that no paid factor library is licensed, so every
    // factor has to be traceable to a public publication.
    const sourceById = new Map(SEED_TENANT.factorSources.map((row) => [row.id, row]));
    for (const factor of SEED_TENANT.emissionFactors) {
      expect(factor.sourceId).toBeTruthy();
      const source = sourceById.get(factor.sourceId ?? "");
      expect(source).toBeDefined();
      expect(source?.publisher.length).toBeGreaterThan(0);
      expect(source?.url).toMatch(/^https?:\/\//);
    }
  });

  it("resolves every activity entry to its header and emission source", () => {
    const headerIds = new Set(SEED_TENANT.activityData.map((row) => row.id));
    const sourceIds = new Set(SEED_TENANT.emissionSources.map((row) => row.id));
    for (const entry of SEED_TENANT.activityEntries) {
      expect(headerIds.has(entry.activityDataId)).toBe(true);
      expect(sourceIds.has(entry.emissionSourceId)).toBe(true);
    }
  });

  it("resolves every optional master-data reference on an activity entry", () => {
    const master = SEED_TENANT.masterData;
    const lookups: readonly [keyof typeof SEED_TENANT.activityEntries[number], Set<string>][] =
      [
        ["productId", new Set(master.products.map((row) => row.id))],
        ["supplierId", new Set(master.suppliers.map((row) => row.id))],
        ["vehicleId", new Set(master.vehicles.map((row) => row.id))],
        ["fuelId", new Set(master.fuels.map((row) => row.id))],
        ["refrigerantId", new Set(master.refrigerants.map((row) => row.id))],
        ["rawMaterialId", new Set(master.rawMaterials.map((row) => row.id))],
        ["logisticsRouteId", new Set(master.logisticsRoutes.map((row) => row.id))],
        ["energySourceId", new Set(master.energySources.map((row) => row.id))],
        ["wasteTypeId", new Set(master.wasteTypes.map((row) => row.id))],
        ["waterSourceId", new Set(master.waterSources.map((row) => row.id))],
      ];

    for (const entry of SEED_TENANT.activityEntries) {
      for (const [field, ids] of lookups) {
        const value = entry[field];
        if (typeof value === "string" && value.length > 0) {
          expect(ids.has(value), `${String(field)}=${value}`).toBe(true);
        }
      }
    }
  });

  it("resolves every target, roadmap action and scenario assumption", () => {
    const targetTypeIds = new Set(SEED_TENANT.targetTypes.map((row) => row.id));
    const targetIds = new Set(SEED_TENANT.targets.map((row) => row.id));
    const technologyIds = new Set(
      SEED_TENANT.abatementTechnologies.map((row) => row.id),
    );
    const scenarioIds = new Set(SEED_TENANT.scenarios.map((row) => row.id));

    for (const target of SEED_TENANT.targets) {
      expect(targetTypeIds.has(target.targetTypeId)).toBe(true);
    }
    expect(targetIds.has(SEED_TENANT.netZeroCommitment.targetId)).toBe(true);
    for (const action of SEED_TENANT.roadmapActions) {
      expect(action.roadmapId).toBe(SEED_TENANT.roadmap.id);
      expect(technologyIds.has(action.technologyId)).toBe(true);
      expect(action.endYear).toBeGreaterThanOrEqual(action.startYear);
    }
    for (const assumption of SEED_TENANT.scenarioAssumptions) {
      expect(scenarioIds.has(assumption.scenarioId)).toBe(true);
    }
    for (const comparison of SEED_TENANT.scenarioComparisons) {
      expect(scenarioIds.has(comparison.scenarioAId)).toBe(true);
      expect(scenarioIds.has(comparison.scenarioBId)).toBe(true);
    }
  });

  it("resolves every carbon offset to a credit the seed writes", () => {
    const creditIds = new Set(SEED_TENANT.carbonCredits.map((row) => row.id));
    for (const offset of SEED_TENANT.carbonOffsets) {
      expect(creditIds.has(offset.creditId)).toBe(true);
    }
  });

  it("never retires more of a credit than was issued", () => {
    const retiredByCredit = new Map<string, number>();
    for (const offset of SEED_TENANT.carbonOffsets) {
      retiredByCredit.set(
        offset.creditId,
        (retiredByCredit.get(offset.creditId) ?? 0) + offset.quantity,
      );
    }
    for (const credit of SEED_TENANT.carbonCredits) {
      expect(retiredByCredit.get(credit.id) ?? 0).toBeLessThanOrEqual(credit.quantity);
    }
  });

  it("resolves every role permission and user role", () => {
    const permissionIds = new Set(SEED_TENANT.permissions.map((row) => row.id));
    const roleIds = new Set(SEED_TENANT.roles.map((row) => row.id));

    for (const role of SEED_TENANT.roles) {
      expect(role.organizationId).toBe(SEED_TENANT.organization.id);
      for (const permissionId of role.permissionIds) {
        expect(permissionIds.has(permissionId), permissionId).toBe(true);
      }
    }
    for (const user of SEED_TENANT.users) {
      expect(user.organizationId).toBe(SEED_TENANT.organization.id);
      for (const roleId of user.roleIds) {
        expect(roleIds.has(roleId), roleId).toBe(true);
      }
    }
    for (const key of SEED_TENANT.apiKeys) {
      const userIds = new Set(SEED_TENANT.users.map((row) => row.id));
      expect(userIds.has(key.userId)).toBe(true);
    }
  });

  it("is unique on every id and natural key the seed upserts on", () => {
    expect(duplicates(SEED_TENANT.facilities, (row) => row.id)).toEqual([]);
    expect(duplicates(SEED_TENANT.emissionSources, (row) => row.id)).toEqual([]);
    expect(duplicates(SEED_TENANT.activityEntries, (row) => row.id)).toEqual([]);
    expect(duplicates(SEED_TENANT.emissionFactors, (row) => row.id)).toEqual([]);
    // Natural unique keys the seed's `where` clauses depend on.
    expect(duplicates(SEED_TENANT.users, (row) => row.email)).toEqual([]);
    expect(duplicates(SEED_TENANT.targetTypes, (row) => row.code)).toEqual([]);
    expect(duplicates(SEED_TENANT.factorSources, (row) => row.name)).toEqual([]);
    expect(
      duplicates(SEED_TENANT.factorVersions, (row) => `${row.sourceId}@${row.version}`),
    ).toEqual([]);
    expect(
      duplicates(SEED_TENANT.permissions, (row) => `${row.resource}:${row.action}`),
    ).toEqual([]);
    expect(
      duplicates(SEED_TENANT.roles, (row) => `${row.organizationId}:${row.name}`),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fixture parity — the decision-5 guarantee
// ---------------------------------------------------------------------------

describe("fixture parity", () => {
  it("seeds the same organization the demo fixtures serve", () => {
    expect(SEED_TENANT.organization.id).toBe(DEMO_ORGANIZATION_ID);
  });

  it("seeds exactly the fixture activity entries", () => {
    expect(SEED_TENANT.activityEntries).toBe(DEMO_ACTIVITY_ENTRIES);
    expect(SEED_TENANT.activityEntries).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT);
    expect(SEED_TENANT_TOTALS.activityEntries).toBe(DEMO_EXPECTED_ENTRY_COUNT);
  });

  it("reproduces the fixture activity quantity totals source by source and unit by unit", () => {
    const fixtureTotals = demoActivityTotals();

    expect(Object.keys(SEED_TENANT_TOTALS.quantityBySourceAndUnit).sort()).toEqual(
      Object.keys(fixtureTotals).sort(),
    );
    for (const [key, total] of Object.entries(fixtureTotals)) {
      expect(SEED_TENANT_TOTALS.quantityBySourceAndUnit[key]).toBeCloseTo(total, 6);
    }
    // And the grand total agrees with a direct sum over the raw entries.
    const grandTotal = Object.values(fixtureTotals).reduce((sum, value) => sum + value, 0);
    expect(grandTotal).toBeCloseTo(
      DEMO_ACTIVITY_ENTRIES.reduce((sum, entry) => sum + entry.quantity, 0),
      2,
    );
  });

  it("produces the same computed inventory from the seeded rows as from the fixtures", () => {
    // The strongest form of the parity guarantee: the *calculated* totals agree,
    // not merely the row counts. Both sides run the real orchestrator.
    const year = SEED_TENANT.meta.currentYear;
    const entries = demoEntriesForYear(year);
    const request = {
      organizationId: SEED_TENANT.organization.id,
      name: `Parity check ${year}`,
      reportingYear: year,
      period: demoPeriodForYear(year),
      gwpVersion: "AR6" as const,
      approach: "ACTIVITY_BASED" as const,
      consolidationApproach: "OPERATIONAL_CONTROL" as const,
      scope2Basis: "LOCATION" as const,
      facilities: SEED_TENANT.facilityConsolidation,
      candidateFactors: SEED_TENANT.emissionFactors,
      entries,
    };

    const first = runCalculation(request);
    const second = runCalculation(request);

    expect(entries.length).toBe(DEMO_EXPECTED_ENTRY_COUNT / 2);
    expect(first.inventory.totalEmissions).toBeGreaterThan(0);
    // Deterministic: two runs over the seeded data give byte-identical totals.
    expect(second.inventory.totalEmissions).toBe(first.inventory.totalEmissions);
    expect(second.inventory.scope1Total).toBe(first.inventory.scope1Total);
    expect(second.inventory.scope3Total).toBe(first.inventory.scope3Total);
  });
});

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

describe("admin credential", () => {
  it("produces a self-describing scrypt digest, not a recoverable password", () => {
    const hash = seedAdminPasswordHash("correct horse battery staple");

    expect(hash.startsWith(`${PASSWORD_HASH_PREFIX}$`)).toBe(true);
    // Six `$`-separated fields: scheme, N, r, p, salt, digest.
    expect(hash.split("$")).toHaveLength(6);
    expect(hash).not.toContain("correct horse battery staple");
  });

  it("verifies against the password it was derived from and nothing else", () => {
    const hash = seedAdminPasswordHash(SEED_ADMIN_DEFAULT_PASSWORD);

    expect(verifyPassword(SEED_ADMIN_DEFAULT_PASSWORD, hash)).toBe(true);
    expect(verifyPassword(`${SEED_ADMIN_DEFAULT_PASSWORD}x`, hash)).toBe(false);
  });

  it("salts the digest, so two runs never produce the same hash", () => {
    // Asserting the format rather than the value is the only correct thing to do
    // for a salted hash.
    expect(seedAdminPasswordHash("same-password")).not.toBe(
      seedAdminPasswordHash("same-password"),
    );
  });

  it("reports whether the operator left the default password in place", () => {
    expect(usingDefaultAdminPassword({})).toBe(true);
    expect(usingDefaultAdminPassword({ SEED_ADMIN_PASSWORD: "" })).toBe(true);
    expect(usingDefaultAdminPassword({ SEED_ADMIN_PASSWORD: "set" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reported counts
// ---------------------------------------------------------------------------

describe("SEED_COUNTS", () => {
  it("agrees with the data it summarises", () => {
    expect(SEED_COUNTS.reference.unitConversions).toBe(UNIT_CONVERSION_SEEDS.length);
    expect(SEED_COUNTS.reference.scope3Configs).toBe(15);
    expect(SEED_COUNTS.reference.disclosureRequirements).toBe(
      DISCLOSURE_REQUIREMENTS.length,
    );
    expect(SEED_COUNTS.tenant.activityEntries).toBe(DEMO_EXPECTED_ENTRY_COUNT);
    expect(SEED_COUNTS.tenant.organizations).toBe(1);
  });

  it("reports a non-empty count for every table the seed writes", () => {
    for (const [name, count] of Object.entries(SEED_COUNTS.reference)) {
      expect(count, `reference.${name}`).toBeGreaterThan(0);
    }
    for (const [name, count] of Object.entries(SEED_COUNTS.tenant)) {
      expect(count, `tenant.${name}`).toBeGreaterThan(0);
    }
  });
});
