// Core TypeScript interfaces for the Carbon Intelligence Operating System

export interface Organization {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  type: "corporate" | "division" | "facility" | "site";
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export type UserRole = "admin" | "manager" | "analyst" | "auditor" | "viewer";

export interface EmissionRecord {
  id: string;
  organizationId: string;
  scope: EmissionScope;
  category: string;
  source: string;
  amount: number;
  unit: string;
  co2e: number;
  period: string;
  status: "draft" | "validated" | "verified" | "reported";
  createdAt: Date;
}

export type EmissionScope = "scope1" | "scope2" | "scope3";

export interface EmissionFactor {
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

export interface ActivityData {
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

export interface AIAnalysis {
  id: string;
  type: "anomaly" | "gap" | "quality" | "recommendation";
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "resolved";
  createdAt: Date;
}

export interface DecarbonizationMilestone {
  year: number;
  target: number;
  description: string;
  status: "planned" | "in_progress" | "achieved" | "at_risk";
}

export interface Scenario {
  id: string;
  name: string;
  type: "bau" | "carbon_neutral" | "net_zero" | "aggressive" | "conservative" | "custom";
  description: string;
  targetYear: number;
  reductionTarget: number;
  capex: number;
  opex: number;
}

export interface VerificationRecord {
  id: string;
  type: "internal" | "external" | "third_party";
  status: "pending" | "in_progress" | "completed" | "rejected";
  auditor: string;
  scope: string;
  startDate: Date;
  completionDate: Date | null;
}

export interface CarbonCredit {
  id: string;
  type: "offset" | "inset" | "rec" | "ppa";
  registry: string;
  quantity: number;
  vintage: number;
  status: "active" | "retired" | "pending";
  price: number;
  currency: string;
}

export interface ESGFramework {
  id: string;
  name: string;
  version: string;
  status: "not_started" | "in_progress" | "submitted" | "verified";
  dueDate: Date | null;
  completionPercent: number;
}

export interface APIEndpoint {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  status: "active" | "deprecated" | "maintenance";
  rateLimit: number;
  version: string;
}

export interface AIAgent {
  id: string;
  name: string;
  type: string;
  status: "active" | "idle" | "error" | "disabled";
  lastRun: Date | null;
  successRate: number;
  description: string;
}
