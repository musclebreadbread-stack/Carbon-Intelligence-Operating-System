/**
 * Demo tenant: SBTi targets, net-zero commitment, carbon budget and roadmap.
 *
 * The baseline is the calculated 2023 inventory, so the target pathway and the
 * progress evaluation are computed against genuinely derived numbers rather than
 * a hardcoded baseline.
 */

import type { GHGScope, TargetBoundary, TargetStatus } from "@/lib/core/enums";

import { DEMO_BASELINE_YEAR } from "./activity-data";
import { DEMO_ORGANIZATION_ID } from "./organization";

/** 1.5 °C absolute contraction rate under SBTi near-term criteria. */
export const DEMO_ANNUAL_REDUCTION_RATE = 0.042;
export const DEMO_TARGET_YEAR = 2033;
export const DEMO_NET_ZERO_YEAR = 2050;

export type DemoTargetType = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly description: string;
  readonly methodology: string;
  readonly pathway: string;
};

export const DEMO_TARGET_TYPES: readonly DemoTargetType[] = [
  {
    id: "demo-tt-absolute-contraction",
    name: "Absolute contraction (1.5 °C)",
    code: "ACA_1_5C",
    description: "Linear annual absolute reduction consistent with a 1.5 °C pathway.",
    methodology: "SBTi Corporate Near-Term Criteria — absolute contraction approach",
    pathway: "1.5C",
  },
  {
    id: "demo-tt-sda",
    name: "Sectoral decarbonisation (SDA)",
    code: "SDA",
    description: "Intensity convergence to a sector-specific 2050 intensity.",
    methodology: "SBTi Sectoral Decarbonization Approach",
    pathway: "WB2C",
  },
  {
    id: "demo-tt-supplier-engagement",
    name: "Supplier engagement target",
    code: "SUPPLIER_ENGAGEMENT",
    description: "Share of Scope 3 category 1 suppliers with their own science-based target.",
    methodology: "SBTi Scope 3 supplier engagement criteria",
    pathway: "ENGAGEMENT",
  },
];

export type DemoTarget = {
  readonly id: string;
  readonly organizationId: string;
  readonly targetTypeId: string;
  readonly name: string;
  readonly boundary: TargetBoundary;
  readonly baselineYear: number;
  readonly targetYear: number;
  /** Reduction from the baseline as a *percentage*, matching SBTi convention. */
  readonly targetReduction: number;
  readonly methodology: string;
  readonly status: TargetStatus;
  readonly submittedAt: Date | null;
  readonly approvedAt: Date | null;
  readonly validatedBy: string | null;
  /** Scopes the target covers; used to slice the inventory for progress. */
  readonly scopes: readonly GHGScope[];
};

export const DEMO_TARGETS: readonly DemoTarget[] = [
  {
    id: "demo-target-s12-2033",
    organizationId: DEMO_ORGANIZATION_ID,
    targetTypeId: "demo-tt-absolute-contraction",
    name: "Scope 1+2 절대감축 42 % by 2033",
    boundary: "SCOPE_1_2",
    baselineYear: DEMO_BASELINE_YEAR,
    targetYear: DEMO_TARGET_YEAR,
    targetReduction: 42,
    methodology: "SBTi absolute contraction approach, 4.2 %/yr linear",
    status: "APPROVED",
    submittedAt: new Date(Date.UTC(2024, 1, 20)),
    approvedAt: new Date(Date.UTC(2024, 6, 11)),
    validatedBy: "Science Based Targets initiative",
    scopes: ["SCOPE_1", "SCOPE_2_LOCATION", "SCOPE_2_MARKET"],
  },
  {
    id: "demo-target-s3-2033",
    organizationId: DEMO_ORGANIZATION_ID,
    targetTypeId: "demo-tt-absolute-contraction",
    name: "Scope 3 절대감축 25 % by 2033",
    boundary: "SCOPE_3_ONLY",
    baselineYear: DEMO_BASELINE_YEAR,
    targetYear: DEMO_TARGET_YEAR,
    targetReduction: 25,
    methodology: "SBTi Scope 3 absolute reduction, categories 1, 3, 4, 5, 6 and 7",
    status: "APPROVED",
    submittedAt: new Date(Date.UTC(2024, 1, 20)),
    approvedAt: new Date(Date.UTC(2024, 6, 11)),
    validatedBy: "Science Based Targets initiative",
    scopes: ["SCOPE_3"],
  },
  {
    id: "demo-target-supplier-engagement",
    organizationId: DEMO_ORGANIZATION_ID,
    targetTypeId: "demo-tt-supplier-engagement",
    name: "구매금액 70 % 협력사 SBT 설정 by 2029",
    boundary: "SCOPE_3_ONLY",
    baselineYear: DEMO_BASELINE_YEAR,
    targetYear: 2029,
    targetReduction: 70,
    methodology: "Share of category 1 spend covered by supplier science-based targets",
    status: "SUBMITTED",
    submittedAt: new Date(Date.UTC(2024, 9, 2)),
    approvedAt: null,
    validatedBy: null,
    scopes: ["SCOPE_3"],
  },
];

export type DemoNetZeroCommitment = {
  readonly id: string;
  readonly targetId: string;
  readonly netZeroYear: number;
  /** Fraction of the baseline left as residual emissions at net zero. */
  readonly residualShare: number;
  readonly neutralisationApproach: string;
  readonly status: TargetStatus;
};

export const DEMO_NET_ZERO_COMMITMENT: DemoNetZeroCommitment = {
  id: "demo-netzero-2050",
  targetId: "demo-target-s12-2033",
  netZeroYear: DEMO_NET_ZERO_YEAR,
  residualShare: 0.1,
  neutralisationApproach: "Durable removals (biochar and DACCS) for residual emissions only",
  status: "APPROVED",
};

export type DemoCarbonBudget = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly totalBudget: number;
  readonly unit: string;
  readonly startYear: number;
  readonly endYear: number;
  readonly temperature: number;
  readonly methodology: string;
  readonly status: string;
};

export const DEMO_CARBON_BUDGET: DemoCarbonBudget = {
  id: "demo-budget-1p5c",
  organizationId: DEMO_ORGANIZATION_ID,
  name: "1.5 °C 기업 탄소예산 2023-2033",
  totalBudget: 520_000,
  unit: "tCO2e",
  startYear: DEMO_BASELINE_YEAR,
  endYear: DEMO_TARGET_YEAR,
  temperature: 1.5,
  methodology: "Cumulative emissions under a 4.2 %/yr linear contraction from the 2023 baseline",
  status: "active",
};

export type DemoAbatementTechnology = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly technologyReadiness: number;
  /** tCO2e per year at full deployment. */
  readonly abatementPotential: number;
  /** Marginal abatement cost, USD per tCO2e. Negative means net saving. */
  readonly costPerTonne: number;
  readonly implementationTime: string;
  readonly scalability: string;
  readonly applicableSectors: readonly string[];
  readonly capex: number;
  readonly annualSavings: number;
  readonly projectLifeYears: number;
};

export const DEMO_ABATEMENT_TECHNOLOGIES: readonly DemoAbatementTechnology[] = [
  {
    id: "demo-tech-led-retrofit",
    name: "LED 조명 전환 (LED lighting retrofit)",
    category: "Energy efficiency",
    description: "Replace remaining fluorescent lighting across both plants.",
    technologyReadiness: 9,
    abatementPotential: 640,
    costPerTonne: -48,
    implementationTime: "6 months",
    scalability: "HIGH",
    applicableSectors: ["Manufacturing"],
    capex: 420_000,
    annualSavings: 148_000,
    projectLifeYears: 12,
  },
  {
    id: "demo-tech-vsd-motors",
    name: "인버터 모터 (Variable-speed drive motors)",
    category: "Energy efficiency",
    description: "Fit VSDs to extruder and utility motors above 30 kW.",
    technologyReadiness: 9,
    abatementPotential: 1_180,
    costPerTonne: -21,
    implementationTime: "12 months",
    scalability: "HIGH",
    applicableSectors: ["Manufacturing", "Chemicals"],
    capex: 1_150_000,
    annualSavings: 246_000,
    projectLifeYears: 15,
  },
  {
    id: "demo-tech-waste-heat",
    name: "폐열회수 (Waste heat recovery)",
    category: "Energy efficiency",
    description: "Economiser on the Ulsan LNG boiler flue gas.",
    technologyReadiness: 8,
    abatementPotential: 520,
    costPerTonne: 14,
    implementationTime: "18 months",
    scalability: "MEDIUM",
    applicableSectors: ["Manufacturing"],
    capex: 980_000,
    annualSavings: 121_000,
    projectLifeYears: 15,
  },
  {
    id: "demo-tech-onsite-solar",
    name: "자가 태양광 확대 (On-site solar expansion)",
    category: "Renewable energy",
    description: "Add 4.2 MWp of rooftop PV across Ulsan and Incheon.",
    technologyReadiness: 9,
    abatementPotential: 2_260,
    costPerTonne: 8,
    implementationTime: "24 months",
    scalability: "HIGH",
    applicableSectors: ["Manufacturing", "Logistics"],
    capex: 5_400_000,
    annualSavings: 690_000,
    projectLifeYears: 25,
  },
  {
    id: "demo-tech-ppa-expansion",
    name: "재생에너지 PPA 확대 (Renewable PPA expansion)",
    category: "Renewable energy",
    description: "Extend the solar PPA to cover 60 % of Ulsan consumption.",
    technologyReadiness: 9,
    abatementPotential: 6_800,
    costPerTonne: 19,
    implementationTime: "18 months",
    scalability: "HIGH",
    applicableSectors: ["Manufacturing"],
    capex: 0,
    annualSavings: -1_260_000,
    projectLifeYears: 15,
  },
  {
    id: "demo-tech-boiler-electrification",
    name: "보일러 전기화 (Boiler electrification)",
    category: "Fuel switching",
    description: "Replace the Ulsan LNG boiler with a high-temperature heat pump.",
    technologyReadiness: 7,
    abatementPotential: 2_940,
    costPerTonne: 62,
    implementationTime: "36 months",
    scalability: "MEDIUM",
    applicableSectors: ["Manufacturing", "Chemicals"],
    capex: 7_800_000,
    annualSavings: 410_000,
    projectLifeYears: 20,
  },
  {
    id: "demo-tech-recycled-feedstock",
    name: "재생원료 전환 (Recycled feedstock substitution)",
    category: "Supply chain",
    description: "Move 25 % of resin purchases to recycled polypropylene.",
    technologyReadiness: 8,
    abatementPotential: 4_820,
    costPerTonne: 31,
    implementationTime: "24 months",
    scalability: "MEDIUM",
    applicableSectors: ["Chemicals"],
    capex: 620_000,
    annualSavings: -890_000,
    projectLifeYears: 10,
  },
  {
    id: "demo-tech-refrigerant-swap",
    name: "저GWP 냉매 전환 (Low-GWP refrigerant conversion)",
    category: "Process",
    description: "Convert the process chillers from R-410A to R-513A.",
    technologyReadiness: 8,
    abatementPotential: 210,
    costPerTonne: 74,
    implementationTime: "12 months",
    scalability: "LOW",
    applicableSectors: ["Manufacturing"],
    capex: 310_000,
    annualSavings: 12_000,
    projectLifeYears: 12,
  },
  {
    id: "demo-tech-logistics-modal-shift",
    name: "물류 모달 시프트 (Logistics modal shift)",
    category: "Supply chain",
    description: "Shift 30 % of inbound road freight to rail.",
    technologyReadiness: 9,
    abatementPotential: 320,
    costPerTonne: -6,
    implementationTime: "12 months",
    scalability: "MEDIUM",
    applicableSectors: ["Logistics"],
    capex: 90_000,
    annualSavings: 128_000,
    projectLifeYears: 8,
  },
];

export type DemoRoadmap = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description: string;
  readonly baselineYear: number;
  readonly targetYear: number;
  readonly reductionTarget: number;
  readonly targetType: string;
  readonly status: string;
  readonly publishedAt: Date;
};

export const DEMO_ROADMAP: DemoRoadmap = {
  id: "demo-roadmap-2033",
  organizationId: DEMO_ORGANIZATION_ID,
  name: "2033 탈탄소 로드맵 (2033 decarbonisation roadmap)",
  description:
    "Sequenced abatement plan for the Scope 1+2 42 % target, ordered by marginal abatement cost.",
  baselineYear: DEMO_BASELINE_YEAR,
  targetYear: DEMO_TARGET_YEAR,
  reductionTarget: 42,
  targetType: "ABSOLUTE",
  status: "published",
  publishedAt: new Date(Date.UTC(2024, 7, 30)),
};

export type DemoRoadmapAction = {
  readonly id: string;
  readonly roadmapId: string;
  readonly technologyId: string;
  readonly name: string;
  readonly category: string;
  readonly scope: GHGScope;
  readonly priority: number;
  readonly expectedReduction: number;
  readonly unit: string;
  readonly startYear: number;
  readonly endYear: number;
  readonly status: string;
  readonly owner: string;
  readonly costEstimate: number;
  readonly currency: string;
};

export const DEMO_ROADMAP_ACTIONS: readonly DemoRoadmapAction[] =
  DEMO_ABATEMENT_TECHNOLOGIES.map((technology, index) => ({
    id: `demo-roadmap-action-${technology.id.replace("demo-tech-", "")}`,
    roadmapId: DEMO_ROADMAP.id,
    technologyId: technology.id,
    name: technology.name,
    category: technology.category,
    scope:
      technology.category === "Supply chain"
        ? "SCOPE_3"
        : technology.category === "Renewable energy"
          ? "SCOPE_2_MARKET"
          : "SCOPE_1",
    priority: index + 1,
    expectedReduction: technology.abatementPotential,
    unit: "tCO2e",
    startYear: 2025 + Math.floor(index / 3),
    endYear: 2026 + Math.floor(index / 3),
    status: index < 2 ? "in_progress" : "planned",
    owner: index % 2 === 0 ? "Facilities Engineering" : "Procurement & ESG",
    costEstimate: technology.capex,
    currency: "USD",
  }));
