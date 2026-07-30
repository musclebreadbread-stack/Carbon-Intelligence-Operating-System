/**
 * String-literal mirrors of the Prisma enums used by the domain layer.
 *
 * The domain never imports `@prisma/client` (see the layering decision in the
 * implementation plan), so the enum members are mirrored here. The values are
 * byte-identical to `prisma/schema.prisma`, which keeps plain domain objects
 * assignable to Prisma inputs at the persistence boundary.
 *
 * Each enum is declared as a `const` tuple plus a derived union type so tests
 * can iterate over every member.
 */

export const GHG_SCOPES = [
  "SCOPE_1",
  "SCOPE_2_LOCATION",
  "SCOPE_2_MARKET",
  "SCOPE_3",
] as const;
export type GHGScope = (typeof GHG_SCOPES)[number];

export const SCOPE3_CATEGORIES = [
  "CAT_1_PURCHASED_GOODS",
  "CAT_2_CAPITAL_GOODS",
  "CAT_3_FUEL_ENERGY",
  "CAT_4_UPSTREAM_TRANSPORT",
  "CAT_5_WASTE",
  "CAT_6_BUSINESS_TRAVEL",
  "CAT_7_EMPLOYEE_COMMUTING",
  "CAT_8_UPSTREAM_LEASED",
  "CAT_9_DOWNSTREAM_TRANSPORT",
  "CAT_10_PROCESSING",
  "CAT_11_USE_OF_SOLD",
  "CAT_12_END_OF_LIFE",
  "CAT_13_DOWNSTREAM_LEASED",
  "CAT_14_FRANCHISES",
  "CAT_15_INVESTMENTS",
] as const;
export type Scope3Category = (typeof SCOPE3_CATEGORIES)[number];

export const ORGANIZATION_TIERS = [
  "ENTERPRISE",
  "BUSINESS_UNIT",
  "FACILITY",
  "BUILDING",
  "PRODUCTION_LINE",
  "EQUIPMENT",
  "SOURCE",
] as const;
export type OrganizationTier = (typeof ORGANIZATION_TIERS)[number];

export const DATA_QUALITY_LEVELS = [
  "HIGH",
  "MEDIUM",
  "LOW",
  "ESTIMATED",
  "DEFAULT",
] as const;
export type DataQualityLevel = (typeof DATA_QUALITY_LEVELS)[number];

export const CALCULATION_APPROACHES = [
  "SPEND_BASED",
  "ACTIVITY_BASED",
  "HYBRID",
  "DIRECT_MEASUREMENT",
  "SUPPLIER_SPECIFIC",
  "AVERAGE_DATA",
] as const;
export type CalculationApproach = (typeof CALCULATION_APPROACHES)[number];

export const REPORTING_FRAMEWORKS = [
  "GHG_PROTOCOL",
  "ISO_14064",
  "ISSB_S1",
  "ISSB_S2",
  "CDP",
  "CSRD",
  "ESRS",
  "TCFD",
  "GRI",
  "SASB",
  "TNFD",
] as const;
export type ReportingFramework = (typeof REPORTING_FRAMEWORKS)[number];

export const EMISSION_FACTOR_UNITS = [
  "KG_CO2E_PER_KWH",
  "KG_CO2E_PER_LITER",
  "KG_CO2E_PER_KG",
  "KG_CO2E_PER_TONNE",
  "KG_CO2E_PER_M3",
  "KG_CO2E_PER_TKM",
  "KG_CO2E_PER_PKM",
  "KG_CO2E_PER_UNIT",
  "KG_CO2E_PER_USD",
  "KG_CO2E_PER_MJ",
] as const;
export type EmissionFactorUnit = (typeof EMISSION_FACTOR_UNITS)[number];

export const RULE_OPERATORS = [
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN_OR_EQUAL",
  "CONTAINS",
  "NOT_CONTAINS",
  "IN",
  "NOT_IN",
  "BETWEEN",
  "IS_NULL",
  "IS_NOT_NULL",
] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export const MEASUREMENT_FREQUENCIES = [
  "REAL_TIME",
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "ANNUALLY",
] as const;
export type MeasurementFrequency = (typeof MEASUREMENT_FREQUENCIES)[number];

export const VERIFICATION_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * GWP vintage. Not a Prisma enum — the schema stores the chosen vintage as part
 * of the calculation methodology — but the engines need it as a first-class
 * input, so it is declared alongside the other domain enums.
 */
export const GWP_VERSIONS = ["AR4", "AR5", "AR6"] as const;
export type GwpVersion = (typeof GWP_VERSIONS)[number];
