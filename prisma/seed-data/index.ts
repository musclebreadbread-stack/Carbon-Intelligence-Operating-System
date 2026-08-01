/**
 * Barrel for the seed data, plus the counts the seed reports and the integrity test
 * asserts.
 *
 * Importable with no database and no environment: everything below is data or pure
 * derivation, so `npm test -- prisma` can check referential integrity without ever
 * connecting to PostgreSQL.
 */

export * from "./reference";
export * from "./tenant";

import {
  CALCULATION_METHODOLOGY_SEEDS,
  DISCLOSURE_FRAMEWORK_SEEDS,
  SCOPE3_CONFIG_SEEDS,
  UNIT_CONVERSION_SEEDS,
} from "./reference";
import { SEED_TENANT } from "./tenant";

/** Row counts the seed writes, for its own summary output and for the test. */
export const SEED_COUNTS = {
  reference: {
    unitConversions: UNIT_CONVERSION_SEEDS.length,
    scope3Configs: SCOPE3_CONFIG_SEEDS.length,
    methodologies: CALCULATION_METHODOLOGY_SEEDS.length,
    formulas: CALCULATION_METHODOLOGY_SEEDS.reduce(
      (total, methodology) => total + methodology.formulas.length,
      0,
    ),
    disclosureFrameworks: DISCLOSURE_FRAMEWORK_SEEDS.length,
    disclosureRequirements: DISCLOSURE_FRAMEWORK_SEEDS.reduce(
      (total, framework) => total + framework.requirements.length,
      0,
    ),
    targetTypes: SEED_TENANT.targetTypes.length,
    abatementTechnologies: SEED_TENANT.abatementTechnologies.length,
    permissions: SEED_TENANT.permissions.length,
    roles: SEED_TENANT.roles.length,
  },
  tenant: {
    organizations: 1,
    businessUnits: SEED_TENANT.businessUnits.length,
    facilities: SEED_TENANT.facilities.length,
    buildings: SEED_TENANT.buildings.length,
    productionLines: SEED_TENANT.productionLines.length,
    equipment: SEED_TENANT.equipment.length,
    emissionSources: SEED_TENANT.emissionSources.length,
    users: SEED_TENANT.users.length,
    factorSources: SEED_TENANT.factorSources.length,
    factorVersions: SEED_TENANT.factorVersions.length,
    emissionFactors: SEED_TENANT.emissionFactors.length,
    activityData: SEED_TENANT.activityData.length,
    activityEntries: SEED_TENANT.activityEntries.length,
    ruleSets: SEED_TENANT.ruleSets.length,
    targets: SEED_TENANT.targets.length,
    scenarios: SEED_TENANT.scenarios.length,
    carbonCredits: SEED_TENANT.carbonCredits.length,
    apiKeys: SEED_TENANT.apiKeys.length,
    notifications: SEED_TENANT.notifications.length,
  },
} as const;
