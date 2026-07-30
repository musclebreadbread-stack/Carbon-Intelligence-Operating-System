/**
 * Presentation-layer DTOs for the Carbon Intelligence Operating System.
 *
 * These interfaces define the shape of data used by the frontend UI components.
 * They are NOT persistence models -- the authoritative schema lives in
 * prisma/schema.prisma and is accessed via Prisma Client generated types.
 * Use these DTOs for API responses, component props, and display logic only.
 */

/** Organization summary used in navigation and org switcher UI. */
export interface OrganizationDTO {
  id: string;
  name: string;
  parentId: string | null;
  hierarchyLevel: "CORPORATE" | "DIVISION" | "BUSINESS_UNIT" | "FACILITY" | "SITE";
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

/** Lightweight user representation for session context and avatar displays. */
export interface UserDTO {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  avatarUrl: string | null;
  createdAt: Date;
}

/** Summarized emission result for dashboard cards and tables. */
export interface EmissionRecordDTO {
  id: string;
  organizationId: string;
  scope: EmissionScope;
  category: string;
  source: string;
  amount: number;
  unit: string;
  co2eKg: number;
  period: string;
  status: "DRAFT" | "VALIDATED" | "VERIFIED" | "REPORTED";
  createdAt: Date;
}

export type EmissionScope = "SCOPE_1" | "SCOPE_2_LOCATION" | "SCOPE_2_MARKET" | "SCOPE_3";

/** Emission factor entry for display in factor library views. */
export interface EmissionFactorDTO {
  id: string;
  name: string;
  category: string;
  region: string;
  value: number;
  unit: string;
  source: string;
  version: string;
  validFrom: Date;
  validTo: Date | null;
}

/** Activity data entry for data ingestion UI. */
export interface ActivityDataDTO {
  id: string;
  organizationId: string;
  type: string;
  source: string;
  quantity: number;
  unit: string;
  period: string;
  validationStatus: "pending" | "valid" | "invalid" | "flagged";
  createdAt: Date;
}

/** KPI card display props for dashboard widgets. */
export interface KPICard {
  title: string;
  value: string | number;
  unit?: string;
  change?: number;
  changeLabel?: string;
  trend?: "up" | "down" | "neutral";
}

export interface NavigationItem {
  title: string;
  href: string;
  icon: string;
  badge?: string;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

/** AI analysis item for the anomaly/recommendation feed. */
export interface AIAnalysisDTO {
  id: string;
  type: "anomaly" | "gap" | "quality" | "recommendation";
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "resolved";
  createdAt: Date;
}

/** Decarbonization milestone for pathway visualization. */
export interface DecarbonizationMilestoneDTO {
  year: number;
  target: number;
  description: string;
  status: "planned" | "in_progress" | "achieved" | "at_risk";
}

/** Scenario modeling entry for the scenario comparison UI. */
export interface ScenarioDTO {
  id: string;
  name: string;
  type: "bau" | "carbon_neutral" | "net_zero" | "aggressive" | "conservative" | "custom";
  description: string;
  targetYear: number;
  reductionTarget: number;
  capex: number;
  opex: number;
}

/** Verification/audit record for assurance tracking. */
export interface VerificationRecordDTO {
  id: string;
  type: "internal" | "external" | "third_party";
  status: "pending" | "in_progress" | "completed" | "rejected";
  auditor: string;
  scope: string;
  startDate: Date;
  completionDate: Date | null;
}

/** Carbon credit/offset entry for the credit registry view. */
export interface CarbonCreditDTO {
  id: string;
  type: "offset" | "inset" | "rec" | "ppa";
  registry: string;
  quantity: number;
  vintage: number;
  status: "active" | "retired" | "pending";
  price: number;
  currency: string;
}

/** ESG framework progress for the disclosure tracker. */
export interface ESGFrameworkDTO {
  id: string;
  name: string;
  version: string;
  status: "not_started" | "in_progress" | "submitted" | "verified";
  dueDate: Date | null;
  completionPercent: number;
}

/** API endpoint status for the integrations panel. */
export interface APIEndpointDTO {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  status: "active" | "deprecated" | "maintenance";
  rateLimit: number;
  version: string;
}

/** AI agent card data for the agent orchestration view. */
export interface AIAgentDTO {
  id: string;
  name: string;
  type: string;
  status: "active" | "idle" | "error" | "disabled";
  lastRun: Date | null;
  successRate: number;
  description: string;
}
