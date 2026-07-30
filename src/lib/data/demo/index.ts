/**
 * Barrel and aggregate view of the demo dataset.
 *
 * `DEMO_DATASET` is the single object every repository fallback reads from, and the
 * single object the item-32 seed writes, which is what guarantees demo mode and a
 * seeded database show identical numbers.
 */

export * from "./organization";
export * from "./master-data";
export * from "./emission-factors";
export * from "./activity-data";
export * from "./rules";
export * from "./targets";
export * from "./scenarios";
export * from "./credits";
export * from "./verification";
export * from "./disclosure";
export * from "./ai";
export * from "./security";

import {
  DEMO_ACTIVITY_DATA,
  DEMO_ACTIVITY_ENTRIES,
  DEMO_BASELINE_YEAR,
  DEMO_CALCULATION_ENTRIES,
  DEMO_CURRENT_YEAR,
  DEMO_REPORTING_YEARS,
} from "./activity-data";
import {
  DEMO_AGENTS,
  DEMO_AGENT_TASKS,
  DEMO_AGENT_TOOLS,
  DEMO_AI_MODELS,
  DEMO_DATA_SOURCES,
  DEMO_MCP_CONNECTIONS,
  DEMO_MCP_SERVERS,
} from "./ai";
import {
  DEMO_CARBON_CREDITS,
  DEMO_CARBON_OFFSETS,
  DEMO_CARBON_PRICES,
  DEMO_ETS_POSITION,
  DEMO_INTERNAL_CARBON_PRICE,
  DEMO_PPAS,
  DEMO_RECS,
} from "./credits";
import {
  DEMO_DISCLOSURE_FRAMEWORK_ROWS,
  DEMO_DISCLOSURE_REPORTS,
  DEMO_NARRATIVE_RESPONSES,
} from "./disclosure";
import {
  DEMO_EMISSION_FACTORS,
  DEMO_FACTOR_CATEGORIES,
  DEMO_FACTOR_SOURCES,
  DEMO_FACTOR_VERSIONS,
} from "./emission-factors";
import {
  DEMO_ENERGY_SOURCES,
  DEMO_FUELS,
  DEMO_FUEL_TYPES,
  DEMO_LOGISTICS_ROUTES,
  DEMO_PRODUCTS,
  DEMO_RAW_MATERIALS,
  DEMO_REFRIGERANTS,
  DEMO_SUPPLIERS,
  DEMO_VEHICLES,
  DEMO_WASTE_TYPES,
  DEMO_WATER_SOURCES,
} from "./master-data";
import {
  DEMO_BUILDINGS,
  DEMO_BUSINESS_UNITS,
  DEMO_EMISSION_SOURCES,
  DEMO_EQUIPMENT,
  DEMO_FACILITIES,
  DEMO_FACILITY_CONSOLIDATION,
  DEMO_ORGANIZATION,
  DEMO_PRODUCTION_LINES,
} from "./organization";
import { DEMO_RULE_SETS } from "./rules";
import {
  DEMO_SCENARIOS,
  DEMO_SCENARIO_ASSUMPTIONS,
  DEMO_SCENARIO_COMPARISONS,
} from "./scenarios";
import {
  DEMO_ACCESS_POLICIES,
  DEMO_API_KEYS,
  DEMO_PERMISSIONS,
  DEMO_ROLES,
  DEMO_USERS,
} from "./security";
import {
  DEMO_ABATEMENT_TECHNOLOGIES,
  DEMO_CARBON_BUDGET,
  DEMO_NET_ZERO_COMMITMENT,
  DEMO_ROADMAP,
  DEMO_ROADMAP_ACTIONS,
  DEMO_TARGETS,
  DEMO_TARGET_TYPES,
} from "./targets";
import {
  DEMO_EVIDENCE_ITEMS,
  DEMO_MEASUREMENTS,
  DEMO_MONITORING_PARAMETERS,
  DEMO_MONITORING_PLAN,
  DEMO_MRV_PLAN,
  DEMO_VERIFICATION_ENGAGEMENT,
  DEMO_VERIFICATION_FINDINGS,
  DEMO_VERIFICATION_SCOPES,
} from "./verification";

export const DEMO_DATASET = {
  meta: {
    reportingYears: DEMO_REPORTING_YEARS,
    baselineYear: DEMO_BASELINE_YEAR,
    currentYear: DEMO_CURRENT_YEAR,
  },
  organization: DEMO_ORGANIZATION,
  businessUnits: DEMO_BUSINESS_UNITS,
  facilities: DEMO_FACILITIES,
  facilityConsolidation: DEMO_FACILITY_CONSOLIDATION,
  buildings: DEMO_BUILDINGS,
  productionLines: DEMO_PRODUCTION_LINES,
  equipment: DEMO_EQUIPMENT,
  emissionSources: DEMO_EMISSION_SOURCES,
  masterData: {
    fuelTypes: DEMO_FUEL_TYPES,
    fuels: DEMO_FUELS,
    vehicles: DEMO_VEHICLES,
    refrigerants: DEMO_REFRIGERANTS,
    suppliers: DEMO_SUPPLIERS,
    products: DEMO_PRODUCTS,
    rawMaterials: DEMO_RAW_MATERIALS,
    logisticsRoutes: DEMO_LOGISTICS_ROUTES,
    energySources: DEMO_ENERGY_SOURCES,
    wasteTypes: DEMO_WASTE_TYPES,
    waterSources: DEMO_WATER_SOURCES,
  },
  factorSources: DEMO_FACTOR_SOURCES,
  factorVersions: DEMO_FACTOR_VERSIONS,
  factorCategories: DEMO_FACTOR_CATEGORIES,
  emissionFactors: DEMO_EMISSION_FACTORS,
  activityData: DEMO_ACTIVITY_DATA,
  activityEntries: DEMO_ACTIVITY_ENTRIES,
  calculationEntries: DEMO_CALCULATION_ENTRIES,
  ruleSets: DEMO_RULE_SETS,
  targetTypes: DEMO_TARGET_TYPES,
  targets: DEMO_TARGETS,
  netZeroCommitment: DEMO_NET_ZERO_COMMITMENT,
  carbonBudget: DEMO_CARBON_BUDGET,
  abatementTechnologies: DEMO_ABATEMENT_TECHNOLOGIES,
  roadmap: DEMO_ROADMAP,
  roadmapActions: DEMO_ROADMAP_ACTIONS,
  scenarios: DEMO_SCENARIOS,
  scenarioAssumptions: DEMO_SCENARIO_ASSUMPTIONS,
  scenarioComparisons: DEMO_SCENARIO_COMPARISONS,
  carbonCredits: DEMO_CARBON_CREDITS,
  carbonOffsets: DEMO_CARBON_OFFSETS,
  carbonPrices: DEMO_CARBON_PRICES,
  internalCarbonPrice: DEMO_INTERNAL_CARBON_PRICE,
  etsPosition: DEMO_ETS_POSITION,
  ppas: DEMO_PPAS,
  recs: DEMO_RECS,
  disclosureFrameworks: DEMO_DISCLOSURE_FRAMEWORK_ROWS,
  disclosureReports: DEMO_DISCLOSURE_REPORTS,
  narrativeResponses: DEMO_NARRATIVE_RESPONSES,
  mrvPlan: DEMO_MRV_PLAN,
  monitoringPlan: DEMO_MONITORING_PLAN,
  monitoringParameters: DEMO_MONITORING_PARAMETERS,
  measurements: DEMO_MEASUREMENTS,
  verificationEngagement: DEMO_VERIFICATION_ENGAGEMENT,
  verificationScopes: DEMO_VERIFICATION_SCOPES,
  verificationFindings: DEMO_VERIFICATION_FINDINGS,
  evidenceItems: DEMO_EVIDENCE_ITEMS,
  aiModels: DEMO_AI_MODELS,
  agents: DEMO_AGENTS,
  agentTasks: DEMO_AGENT_TASKS,
  agentTools: DEMO_AGENT_TOOLS,
  mcpServers: DEMO_MCP_SERVERS,
  mcpConnections: DEMO_MCP_CONNECTIONS,
  dataSources: DEMO_DATA_SOURCES,
  permissions: DEMO_PERMISSIONS,
  roles: DEMO_ROLES,
  users: DEMO_USERS,
  accessPolicies: DEMO_ACCESS_POLICIES,
  apiKeys: DEMO_API_KEYS,
} as const;

export type DemoDataset = typeof DEMO_DATASET;
