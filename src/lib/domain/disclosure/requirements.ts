/**
 * Seeded disclosure-requirement catalogue.
 *
 * One entry per individual datapoint a framework asks for, shaped to the
 * `DisclosureRequirement` model. `category` is always one of the
 * `requirementGroups` codes the framework declares in
 * `src/lib/reference/frameworks.ts`, so the report assembler can build a section
 * tree from the group list and hang these requirements off it.
 *
 * Requirements that a calculated inventory can answer on its own carry a
 * `metric`; `mapInventoryToRequirements` uses it to auto-populate the numeric
 * response. Everything else is narrative and has to be written by a human, which
 * is exactly what the completeness report surfaces.
 *
 * The catalogue is deliberately partial for narrative-heavy frameworks: it covers
 * the quantitative core and the mandatory narrative headings, not every
 * sub-question of a 300-page standard. `TNFD` has no entries because it is a
 * nature-related framework with no GHG datapoints.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { ReportingFramework, Scope3Category } from "@/lib/core/enums";
import { SCOPE3_CATEGORIES } from "@/lib/core/enums";
import { scope3Definition } from "@/lib/reference/scope3-categories";

export const DISCLOSURE_DATA_TYPES = [
  "NUMERIC",
  "TEXT",
  "BOOLEAN",
  "TABLE",
  "SELECT",
] as const;
export type DisclosureDataType = (typeof DISCLOSURE_DATA_TYPES)[number];

/**
 * Inventory metrics a requirement can be answered from automatically.
 * `scope3Category` requirements additionally declare which category.
 */
export const DISCLOSURE_METRICS = [
  "scope1Total",
  "scope2Location",
  "scope2Market",
  "scope3Total",
  "scope3Category",
  "totalEmissions",
  "biogenicCO2",
  "intensityRevenue",
  "energyConsumption",
  "renewableShare",
  "internalCarbonPrice",
  "retiredCredits",
  "baseYearEmissions",
  "baseYear",
  "reportingYear",
  "gwpVersion",
  "consolidationApproach",
  "scope2Basis",
] as const;
export type DisclosureMetric = (typeof DISCLOSURE_METRICS)[number];

/** One requirement, shaped to `DisclosureRequirement`. */
export type DisclosureRequirementDefinition = {
  readonly framework: ReportingFramework;
  readonly code: string;
  readonly name: string;
  readonly nameKo: string;
  readonly description: string;
  /** Requirement-group code from `FRAMEWORK_DEFINITIONS`. */
  readonly category: string;
  readonly isMandatory: boolean;
  readonly dataType: DisclosureDataType;
  readonly guidance?: string;
  readonly metric?: DisclosureMetric;
  readonly scope3Category?: Scope3Category;
  readonly unit?: string;
};

const TONNES = "tCO2e";

// ---------------------------------------------------------------------------
// GHG Protocol
// ---------------------------------------------------------------------------

const GHG_PROTOCOL: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "GHG_PROTOCOL",
    code: "GHGP-1",
    name: "Organizational boundary and consolidation approach",
    nameKo: "조직 경계 및 연결 방식",
    description:
      "The consolidation approach applied (equity share, financial control or operational control).",
    category: "GHGP-BOUNDARY",
    isMandatory: true,
    dataType: "SELECT",
    metric: "consolidationApproach",
  },
  {
    framework: "GHG_PROTOCOL",
    code: "GHGP-2",
    name: "Gross Scope 1 emissions",
    nameKo: "총 Scope 1 배출량",
    description: "Direct GHG emissions from sources owned or controlled by the company.",
    category: "GHGP-SCOPE1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope1Total",
    unit: TONNES,
  },
  {
    framework: "GHG_PROTOCOL",
    code: "GHGP-3",
    name: "Scope 2 location-based emissions",
    nameKo: "Scope 2 위치기반 배출량",
    description: "Indirect emissions from purchased energy using average grid factors.",
    category: "GHGP-SCOPE2",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope2Location",
    unit: TONNES,
  },
  {
    framework: "GHG_PROTOCOL",
    code: "GHGP-4",
    name: "Scope 2 market-based emissions",
    nameKo: "Scope 2 시장기반 배출량",
    description:
      "Indirect emissions from purchased energy reflecting contractual instruments.",
    category: "GHGP-SCOPE2",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope2Market",
    unit: TONNES,
  },
  {
    framework: "GHG_PROTOCOL",
    code: "GHGP-5",
    name: "Gross Scope 3 emissions",
    nameKo: "총 Scope 3 배출량",
    description: "Value-chain emissions across the fifteen categories.",
    category: "GHGP-SCOPE3",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "scope3Total",
    unit: TONNES,
  },
  {
    framework: "GHG_PROTOCOL",
    code: "GHGP-6",
    name: "Biogenic CO2 reported outside the scopes",
    nameKo: "스코프 외 보고 생물기원 CO2",
    description: "CO2 from biomass combustion, reported separately from the scope totals.",
    category: "GHGP-SCOPE1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "biogenicCO2",
    unit: TONNES,
  },
  {
    framework: "GHG_PROTOCOL",
    code: "GHGP-7",
    name: "Base year and base-year emissions",
    nameKo: "기준연도 및 기준연도 배출량",
    description: "The chosen base year and its recalculated inventory.",
    category: "GHGP-BASEYEAR",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "baseYearEmissions",
    unit: TONNES,
  },
  {
    framework: "GHG_PROTOCOL",
    code: "GHGP-8",
    name: "GWP values applied",
    nameKo: "적용 GWP 값",
    description: "The IPCC assessment report the GWP-100 values were taken from.",
    category: "GHGP-BOUNDARY",
    isMandatory: true,
    dataType: "SELECT",
    metric: "gwpVersion",
  },
];

// ---------------------------------------------------------------------------
// ISO 14064-1
// ---------------------------------------------------------------------------

const ISO_14064: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "ISO_14064",
    code: "ISO-4.1",
    name: "Organizational boundaries",
    nameKo: "조직 경계",
    description: "Description of the organizational boundary and consolidation approach.",
    category: "ISO-4",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ISO_14064",
    code: "ISO-5.1",
    name: "Quantified direct emissions",
    nameKo: "정량화된 직접 배출량",
    description: "Direct GHG emissions and removals, quantified by source.",
    category: "ISO-5",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope1Total",
    unit: TONNES,
  },
  {
    framework: "ISO_14064",
    code: "ISO-5.2",
    name: "Quantified indirect emissions from imported energy",
    nameKo: "수입 에너지의 간접 배출량",
    description: "Indirect emissions arising from imported electricity, steam, heat and cooling.",
    category: "ISO-5",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope2Location",
    unit: TONNES,
  },
  {
    framework: "ISO_14064",
    code: "ISO-5.3",
    name: "Other indirect emissions",
    nameKo: "기타 간접 배출량",
    description: "Other indirect emissions determined to be significant.",
    category: "ISO-5",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "scope3Total",
    unit: TONNES,
  },
  {
    framework: "ISO_14064",
    code: "ISO-8.1",
    name: "GHG report content",
    nameKo: "온실가스 보고서 내용",
    description: "Statement of the reporting period, inventory and methodologies applied.",
    category: "ISO-8",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ISO_14064",
    code: "ISO-9.1",
    name: "Verification statement",
    nameKo: "검증 성명서",
    description: "The level of assurance obtained and the verifier's conclusion.",
    category: "ISO-9",
    isMandatory: false,
    dataType: "TEXT",
  },
];

// ---------------------------------------------------------------------------
// CDP Climate Change
// ---------------------------------------------------------------------------

const CDP_SCOPE3_ROWS: readonly DisclosureRequirementDefinition[] = SCOPE3_CATEGORIES.map(
  (category) => {
    const config = scope3Definition(category);
    return {
      framework: "CDP" as ReportingFramework,
      code: `C6.5-${config.number}`,
      name: `Scope 3 category ${config.number}: ${config.nameEn}`,
      nameKo: `Scope 3 카테고리 ${config.number}: ${config.nameKo}`,
      description: `Gross Scope 3 emissions for category ${config.number}, or an explanation of why it is not relevant.`,
      category: "C6",
      isMandatory: false,
      dataType: "NUMERIC" as DisclosureDataType,
      metric: "scope3Category" as DisclosureMetric,
      scope3Category: category,
      unit: TONNES,
    };
  },
);

const CDP: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "CDP",
    code: "C1.1a",
    name: "Board-level oversight of climate issues",
    nameKo: "기후 이슈에 대한 이사회 감독",
    description: "The board position or committee with responsibility for climate issues.",
    category: "C1",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "CDP",
    code: "C2.3",
    name: "Substantive climate-related risks",
    nameKo: "중대한 기후 관련 위험",
    description: "Risks with the potential to have a substantive financial or strategic impact.",
    category: "C2",
    isMandatory: true,
    dataType: "TABLE",
  },
  {
    framework: "CDP",
    code: "C3.2",
    name: "Climate-related scenario analysis",
    nameKo: "기후 시나리오 분석",
    description: "Whether quantitative scenario analysis was used to inform strategy.",
    category: "C3",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "CDP",
    code: "C4.1a",
    name: "Absolute emissions targets",
    nameKo: "절대량 배출 목표",
    description: "Absolute emission reduction targets, their base year and target year.",
    category: "C4",
    isMandatory: true,
    dataType: "TABLE",
  },
  {
    framework: "CDP",
    code: "C5.1",
    name: "Base year",
    nameKo: "기준연도",
    description: "The base year against which emissions performance is tracked.",
    category: "C5",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "baseYear",
  },
  {
    framework: "CDP",
    code: "C5.2",
    name: "Base year emissions",
    nameKo: "기준연도 배출량",
    description: "Gross emissions in the base year, recalculated for structural change.",
    category: "C5",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "baseYearEmissions",
    unit: TONNES,
  },
  {
    framework: "CDP",
    code: "C5.3",
    name: "Global warming potential values applied",
    nameKo: "적용 지구온난화지수",
    description: "The IPCC assessment report the GWP-100 values were taken from.",
    category: "C5",
    isMandatory: true,
    dataType: "SELECT",
    metric: "gwpVersion",
  },
  {
    framework: "CDP",
    code: "C6.1",
    name: "Gross global Scope 1 emissions",
    nameKo: "총 글로벌 Scope 1 배출량",
    description: "Gross global Scope 1 emissions for the reporting year.",
    category: "C6",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope1Total",
    unit: TONNES,
  },
  {
    framework: "CDP",
    code: "C6.2",
    name: "Scope 2 accounting approach",
    nameKo: "Scope 2 산정 방식",
    description: "Whether location-based, market-based or both are reported.",
    category: "C6",
    isMandatory: true,
    dataType: "SELECT",
    metric: "scope2Basis",
  },
  {
    framework: "CDP",
    code: "C6.3",
    name: "Gross global Scope 2 emissions, location-based",
    nameKo: "총 글로벌 Scope 2 배출량 (위치기반)",
    description: "Location-based Scope 2 emissions for the reporting year.",
    category: "C6",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope2Location",
    unit: TONNES,
  },
  {
    framework: "CDP",
    code: "C6.3b",
    name: "Gross global Scope 2 emissions, market-based",
    nameKo: "총 글로벌 Scope 2 배출량 (시장기반)",
    description:
      "Market-based Scope 2 emissions, required whenever contractual instruments are held.",
    category: "C6",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "scope2Market",
    unit: TONNES,
  },
  {
    framework: "CDP",
    code: "C6.5",
    name: "Gross global Scope 3 emissions",
    nameKo: "총 글로벌 Scope 3 배출량",
    description: "Total Scope 3 emissions across all relevant categories.",
    category: "C6",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope3Total",
    unit: TONNES,
  },
  ...CDP_SCOPE3_ROWS,
  {
    framework: "CDP",
    code: "C6.7",
    name: "Biogenic CO2 emissions outside the scopes",
    nameKo: "스코프 외 생물기원 CO2 배출량",
    description: "CO2 from biomass combustion, reported outside the scope totals.",
    category: "C6",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "biogenicCO2",
    unit: TONNES,
  },
  {
    framework: "CDP",
    code: "C6.10",
    name: "Emissions intensity per unit of revenue",
    nameKo: "매출액 단위당 배출 집약도",
    description: "Gross combined Scope 1 and 2 emissions per unit of total revenue.",
    category: "C6",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "intensityRevenue",
  },
  {
    framework: "CDP",
    code: "C7.1",
    name: "Emissions breakdown by greenhouse gas",
    nameKo: "온실가스별 배출 내역",
    description: "Scope 1 emissions broken down by individual greenhouse gas.",
    category: "C7",
    isMandatory: false,
    dataType: "TABLE",
  },
  {
    framework: "CDP",
    code: "C8.2",
    name: "Energy consumption",
    nameKo: "에너지 소비량",
    description: "Total energy consumption within the reporting boundary.",
    category: "C8",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "energyConsumption",
    unit: "MWh",
  },
  {
    framework: "CDP",
    code: "C8.2d",
    name: "Renewable share of consumed electricity",
    nameKo: "소비 전력의 재생에너지 비중",
    description: "Share of consumed electricity sourced from renewables.",
    category: "C8",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "renewableShare",
    unit: "%",
  },
  {
    framework: "CDP",
    code: "C10.1",
    name: "Verification of reported emissions",
    nameKo: "보고 배출량 검증",
    description: "Whether the reported emissions have been externally verified.",
    category: "C10",
    isMandatory: true,
    dataType: "SELECT",
  },
  {
    framework: "CDP",
    code: "C11.3",
    name: "Internal price on carbon",
    nameKo: "내부 탄소 가격",
    description: "The internal carbon price applied and how it is used.",
    category: "C11",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "internalCarbonPrice",
  },
];

// ---------------------------------------------------------------------------
// IFRS S1 / S2
// ---------------------------------------------------------------------------

const ISSB_S1: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "ISSB_S1",
    code: "S1-27",
    name: "Governance of sustainability-related risks and opportunities",
    nameKo: "지속가능성 위험·기회의 지배구조",
    description: "The governance body and management processes overseeing sustainability.",
    category: "S1-GOV",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ISSB_S1",
    code: "S1-30",
    name: "Strategy and business model effects",
    nameKo: "전략 및 사업모델 영향",
    description: "How sustainability risks and opportunities affect strategy and cash flows.",
    category: "S1-STR",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ISSB_S1",
    code: "S1-43",
    name: "Risk management processes",
    nameKo: "위험관리 프로세스",
    description: "Processes used to identify, assess and prioritise sustainability risks.",
    category: "S1-RM",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ISSB_S1",
    code: "S1-46",
    name: "Metrics and targets",
    nameKo: "지표 및 목표",
    description: "Metrics and targets used to measure sustainability performance.",
    category: "S1-MET",
    isMandatory: true,
    dataType: "TABLE",
  },
];

const ISSB_S2: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "ISSB_S2",
    code: "S2-6",
    name: "Climate-related governance",
    nameKo: "기후 관련 지배구조",
    description: "Governance processes, controls and procedures for climate risks.",
    category: "S2-GOV",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ISSB_S2",
    code: "S2-22",
    name: "Climate resilience and scenario analysis",
    nameKo: "기후 회복력 및 시나리오 분석",
    description: "Assessment of climate resilience using climate-related scenario analysis.",
    category: "S2-STR",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ISSB_S2",
    code: "S2-25",
    name: "Climate risk management",
    nameKo: "기후 위험관리",
    description: "Processes to identify, assess, prioritise and monitor climate risks.",
    category: "S2-RM",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ISSB_S2",
    code: "S2-29a-i",
    name: "Scope 1 greenhouse gas emissions",
    nameKo: "Scope 1 온실가스 배출량",
    description: "Absolute gross Scope 1 emissions for the reporting period.",
    category: "S2-MET",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope1Total",
    unit: TONNES,
  },
  {
    framework: "ISSB_S2",
    code: "S2-29a-ii",
    name: "Scope 2 greenhouse gas emissions",
    nameKo: "Scope 2 온실가스 배출량",
    description: "Absolute gross location-based Scope 2 emissions for the reporting period.",
    category: "S2-MET",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope2Location",
    unit: TONNES,
  },
  {
    framework: "ISSB_S2",
    code: "S2-29a-iii",
    name: "Scope 3 greenhouse gas emissions",
    nameKo: "Scope 3 온실가스 배출량",
    description: "Absolute gross Scope 3 emissions, with the categories included.",
    category: "S2-MET",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope3Total",
    unit: TONNES,
  },
  {
    framework: "ISSB_S2",
    code: "S2-29a-vi",
    name: "Measurement approach and GWP values",
    nameKo: "측정 방식 및 GWP 값",
    description:
      "The measurement approach, inputs and assumptions, including the GWP values applied.",
    category: "S2-MET",
    isMandatory: true,
    dataType: "SELECT",
    metric: "gwpVersion",
  },
  {
    framework: "ISSB_S2",
    code: "S2-29e",
    name: "Internal carbon prices",
    nameKo: "내부 탄소 가격",
    description: "The internal carbon price applied in decision making.",
    category: "S2-MET",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "internalCarbonPrice",
  },
  {
    framework: "ISSB_S2",
    code: "S2-33",
    name: "Industry-based metrics",
    nameKo: "산업별 지표",
    description: "Industry-based metrics associated with the disclosure topics.",
    category: "S2-IND",
    isMandatory: false,
    dataType: "TABLE",
  },
];

// ---------------------------------------------------------------------------
// CSRD and ESRS E1
// ---------------------------------------------------------------------------

const CSRD: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "CSRD",
    code: "CSRD-19A-1",
    name: "Sustainability statement in the management report",
    nameKo: "경영보고서 내 지속가능성 성명",
    description:
      "Sustainability information presented in a dedicated section of the management report.",
    category: "CSRD-19A",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "CSRD",
    code: "CSRD-29A-1",
    name: "Consolidated sustainability reporting",
    nameKo: "연결 지속가능성 보고",
    description: "Sustainability reporting at consolidated group level.",
    category: "CSRD-29A",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "CSRD",
    code: "CSRD-34-1",
    name: "Limited assurance on sustainability reporting",
    nameKo: "지속가능성 보고에 대한 제한적 인증",
    description: "Assurance opinion on the sustainability statement.",
    category: "CSRD-34",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "CSRD",
    code: "CSRD-8-1",
    name: "EU Taxonomy alignment",
    nameKo: "EU 택소노미 정합성",
    description: "Taxonomy-eligible and taxonomy-aligned turnover, CapEx and OpEx.",
    category: "CSRD-8",
    isMandatory: true,
    dataType: "TABLE",
  },
];

const ESRS: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "ESRS",
    code: "ESRS2-GOV-1",
    name: "Role of the administrative, management and supervisory bodies",
    nameKo: "관리·경영·감독 기구의 역할",
    description: "Composition and sustainability responsibilities of the governance bodies.",
    category: "ESRS2",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ESRS",
    code: "E1-1",
    name: "Transition plan for climate change mitigation",
    nameKo: "기후변화 완화 전환계획",
    description: "The transition plan and its compatibility with limiting warming to 1.5 °C.",
    category: "E1",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ESRS",
    code: "E1-2",
    name: "Policies related to climate change mitigation and adaptation",
    nameKo: "기후변화 완화·적응 관련 정책",
    description: "Policies adopted to manage material climate impacts, risks and opportunities.",
    category: "E1",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "ESRS",
    code: "E1-3",
    name: "Actions and resources for climate policies",
    nameKo: "기후 정책 관련 조치 및 자원",
    description: "Key actions taken and the financial resources allocated to them.",
    category: "E1",
    isMandatory: true,
    dataType: "TABLE",
  },
  {
    framework: "ESRS",
    code: "E1-4",
    name: "Targets related to climate change mitigation and adaptation",
    nameKo: "기후변화 완화·적응 목표",
    description: "GHG reduction targets in absolute or intensity terms, with base years.",
    category: "E1",
    isMandatory: true,
    dataType: "TABLE",
  },
  {
    framework: "ESRS",
    code: "E1-5",
    name: "Energy consumption and mix",
    nameKo: "에너지 소비량 및 구성",
    description: "Total energy consumption disaggregated by fossil, nuclear and renewable.",
    category: "E1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "energyConsumption",
    unit: "MWh",
  },
  {
    framework: "ESRS",
    code: "E1-5-RENEWABLE",
    name: "Share of renewable energy in total energy consumption",
    nameKo: "총 에너지 소비 중 재생에너지 비중",
    description: "Renewable share of total energy consumption.",
    category: "E1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "renewableShare",
    unit: "%",
  },
  {
    framework: "ESRS",
    code: "E1-6-1",
    name: "Gross Scope 1 GHG emissions",
    nameKo: "총 Scope 1 온실가스 배출량",
    description: "Gross Scope 1 emissions in metric tonnes of CO2 equivalent.",
    category: "E1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope1Total",
    unit: TONNES,
  },
  {
    framework: "ESRS",
    code: "E1-6-2",
    name: "Gross location-based Scope 2 GHG emissions",
    nameKo: "총 위치기반 Scope 2 온실가스 배출량",
    description: "Gross location-based Scope 2 emissions.",
    category: "E1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope2Location",
    unit: TONNES,
  },
  {
    framework: "ESRS",
    code: "E1-6-3",
    name: "Gross market-based Scope 2 GHG emissions",
    nameKo: "총 시장기반 Scope 2 온실가스 배출량",
    description: "Gross market-based Scope 2 emissions.",
    category: "E1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope2Market",
    unit: TONNES,
  },
  {
    framework: "ESRS",
    code: "E1-6-4",
    name: "Total gross indirect (Scope 3) GHG emissions",
    nameKo: "총 간접(Scope 3) 온실가스 배출량",
    description: "Gross Scope 3 emissions across the material categories.",
    category: "E1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope3Total",
    unit: TONNES,
  },
  {
    framework: "ESRS",
    code: "E1-6-5",
    name: "Total GHG emissions",
    nameKo: "총 온실가스 배출량",
    description: "Total GHG emissions, being Scope 1 plus Scope 2 plus Scope 3.",
    category: "E1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "totalEmissions",
    unit: TONNES,
  },
  {
    framework: "ESRS",
    code: "E1-6-6",
    name: "GHG intensity per net revenue",
    nameKo: "순매출당 온실가스 집약도",
    description: "Total GHG emissions per unit of net revenue.",
    category: "E1",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "intensityRevenue",
  },
  {
    framework: "ESRS",
    code: "E1-7",
    name: "GHG removals and carbon credits",
    nameKo: "온실가스 흡수 및 탄소 크레딧",
    description: "Removals in own operations and credits cancelled outside the value chain.",
    category: "E1",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "retiredCredits",
    unit: TONNES,
  },
  {
    framework: "ESRS",
    code: "E1-8",
    name: "Internal carbon pricing",
    nameKo: "내부 탄소 가격",
    description: "Internal carbon prices applied and the share of emissions they cover.",
    category: "E1",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "internalCarbonPrice",
  },
  {
    framework: "ESRS",
    code: "E1-9",
    name: "Anticipated financial effects from climate risks",
    nameKo: "기후 위험의 예상 재무영향",
    description:
      "Anticipated financial effects from material physical and transition risks.",
    category: "E1",
    isMandatory: false,
    dataType: "TEXT",
    guidance: "Phased in for the first reporting years under the ESRS transitional provisions.",
  },
];

// ---------------------------------------------------------------------------
// TCFD
// ---------------------------------------------------------------------------

const TCFD: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "TCFD",
    code: "TCFD-GOV-a",
    name: "Board oversight of climate risks and opportunities",
    nameKo: "기후 위험·기회에 대한 이사회 감독",
    description: "The board's oversight of climate-related risks and opportunities.",
    category: "TCFD-GOV",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "TCFD",
    code: "TCFD-STR-c",
    name: "Resilience of strategy under climate scenarios",
    nameKo: "기후 시나리오하 전략의 회복력",
    description:
      "Resilience of the strategy under different climate scenarios, including 2 °C or lower.",
    category: "TCFD-STR",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "TCFD",
    code: "TCFD-RM-a",
    name: "Processes for identifying and assessing climate risks",
    nameKo: "기후 위험 식별·평가 프로세스",
    description: "Processes used to identify and assess climate-related risks.",
    category: "TCFD-RM",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "TCFD",
    code: "TCFD-MT-b-1",
    name: "Scope 1 emissions",
    nameKo: "Scope 1 배출량",
    description: "Scope 1 GHG emissions and the related risk metrics.",
    category: "TCFD-MT",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope1Total",
    unit: TONNES,
  },
  {
    framework: "TCFD",
    code: "TCFD-MT-b-2",
    name: "Scope 2 emissions",
    nameKo: "Scope 2 배출량",
    description: "Scope 2 GHG emissions and the related risk metrics.",
    category: "TCFD-MT",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope2Location",
    unit: TONNES,
  },
  {
    framework: "TCFD",
    code: "TCFD-MT-b-3",
    name: "Scope 3 emissions",
    nameKo: "Scope 3 배출량",
    description: "Scope 3 GHG emissions, where appropriate.",
    category: "TCFD-MT",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "scope3Total",
    unit: TONNES,
  },
  {
    framework: "TCFD",
    code: "TCFD-MT-c",
    name: "Targets and performance against them",
    nameKo: "목표 및 목표 대비 성과",
    description: "Targets used to manage climate risks and performance against them.",
    category: "TCFD-MT",
    isMandatory: true,
    dataType: "TABLE",
  },
];

// ---------------------------------------------------------------------------
// GRI 305
// ---------------------------------------------------------------------------

const GRI: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "GRI",
    code: "305-1",
    name: "Direct (Scope 1) GHG emissions",
    nameKo: "직접(Scope 1) 온실가스 배출량",
    description: "Gross direct GHG emissions in metric tonnes of CO2 equivalent.",
    category: "GRI-305",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope1Total",
    unit: TONNES,
  },
  {
    framework: "GRI",
    code: "305-1-c",
    name: "Biogenic CO2 emissions",
    nameKo: "생물기원 CO2 배출량",
    description: "Biogenic CO2 emissions reported separately from the scope totals.",
    category: "GRI-305",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "biogenicCO2",
    unit: TONNES,
  },
  {
    framework: "GRI",
    code: "305-2-LB",
    name: "Energy indirect (Scope 2) GHG emissions, location-based",
    nameKo: "에너지 간접(Scope 2) 배출량 (위치기반)",
    description: "Gross location-based energy indirect GHG emissions.",
    category: "GRI-305",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope2Location",
    unit: TONNES,
  },
  {
    framework: "GRI",
    code: "305-2-MB",
    name: "Energy indirect (Scope 2) GHG emissions, market-based",
    nameKo: "에너지 간접(Scope 2) 배출량 (시장기반)",
    description: "Gross market-based energy indirect GHG emissions, if applicable.",
    category: "GRI-305",
    isMandatory: false,
    dataType: "NUMERIC",
    metric: "scope2Market",
    unit: TONNES,
  },
  {
    framework: "GRI",
    code: "305-3",
    name: "Other indirect (Scope 3) GHG emissions",
    nameKo: "기타 간접(Scope 3) 온실가스 배출량",
    description: "Gross other indirect GHG emissions and the categories included.",
    category: "GRI-305",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope3Total",
    unit: TONNES,
  },
  {
    framework: "GRI",
    code: "305-4",
    name: "GHG emissions intensity",
    nameKo: "온실가스 배출 집약도",
    description: "GHG emissions intensity ratio and the metric chosen as the denominator.",
    category: "GRI-305",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "intensityRevenue",
  },
  {
    framework: "GRI",
    code: "305-5",
    name: "Reduction of GHG emissions",
    nameKo: "온실가스 배출 감축",
    description: "GHG emissions reduced as a direct result of reduction initiatives.",
    category: "GRI-305",
    isMandatory: false,
    dataType: "NUMERIC",
    unit: TONNES,
  },
  {
    framework: "GRI",
    code: "302-1",
    name: "Energy consumption within the organization",
    nameKo: "조직 내 에너지 소비량",
    description: "Total fuel and electricity consumption within the organization.",
    category: "GRI-302",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "energyConsumption",
    unit: "MWh",
  },
];

// ---------------------------------------------------------------------------
// SASB
// ---------------------------------------------------------------------------

const SASB: readonly DisclosureRequirementDefinition[] = [
  {
    framework: "SASB",
    code: "SASB-GHG-1",
    name: "Gross global Scope 1 emissions",
    nameKo: "총 글로벌 Scope 1 배출량",
    description: "Gross global Scope 1 emissions, and the percentage covered by regulations.",
    category: "SASB-GHG",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "scope1Total",
    unit: TONNES,
  },
  {
    framework: "SASB",
    code: "SASB-GHG-2",
    name: "Emissions management strategy and targets",
    nameKo: "배출 관리 전략 및 목표",
    description:
      "Discussion of the long- and short-term strategy to manage Scope 1 emissions and targets.",
    category: "SASB-GHG",
    isMandatory: true,
    dataType: "TEXT",
  },
  {
    framework: "SASB",
    code: "SASB-ENE-1",
    name: "Total energy consumed and renewable share",
    nameKo: "총 에너지 소비량 및 재생에너지 비중",
    description: "Total energy consumed, the percentage grid electricity and renewable share.",
    category: "SASB-ENE",
    isMandatory: true,
    dataType: "NUMERIC",
    metric: "energyConsumption",
    unit: "MWh",
  },
  {
    framework: "SASB",
    code: "SASB-ACT-1",
    name: "Activity metric",
    nameKo: "활동 지표",
    description: "The industry-specific activity metric normalising the disclosures.",
    category: "SASB-ACT",
    isMandatory: true,
    dataType: "NUMERIC",
  },
];

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const DISCLOSURE_REQUIREMENTS: readonly DisclosureRequirementDefinition[] = [
  ...GHG_PROTOCOL,
  ...ISO_14064,
  ...CDP,
  ...ISSB_S1,
  ...ISSB_S2,
  ...CSRD,
  ...ESRS,
  ...TCFD,
  ...GRI,
  ...SASB,
];

const BY_FRAMEWORK = new Map<ReportingFramework, DisclosureRequirementDefinition[]>();
for (const requirement of DISCLOSURE_REQUIREMENTS) {
  const bucket = BY_FRAMEWORK.get(requirement.framework);
  if (bucket) bucket.push(requirement);
  else BY_FRAMEWORK.set(requirement.framework, [requirement]);
}

/** Every requirement declared for one framework, in catalogue order. */
export function requirementsFor(
  framework: ReportingFramework,
): readonly DisclosureRequirementDefinition[] {
  return BY_FRAMEWORK.get(framework) ?? [];
}

/** Look up a single requirement by framework and code. */
export function findRequirement(
  framework: ReportingFramework,
  code: string,
): DisclosureRequirementDefinition | undefined {
  return requirementsFor(framework).find((requirement) => requirement.code === code);
}

/** Requirements a calculated inventory can answer without human input. */
export function autoPopulatableRequirements(
  framework: ReportingFramework,
): readonly DisclosureRequirementDefinition[] {
  return requirementsFor(framework).filter((requirement) => requirement.metric !== undefined);
}
