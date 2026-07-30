/**
 * Disclosure / accounting frameworks supported by the platform.
 *
 * `requirementGroups` are the top-level requirement-group codes each framework
 * organises its disclosures under; the seeded requirement catalogue
 * (`src/lib/domain/disclosure/requirements.ts`) hangs individual requirement
 * codes off these groups.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { REPORTING_FRAMEWORKS, type ReportingFramework } from "@/lib/core/enums";

export type FrameworkKind = "ACCOUNTING" | "DISCLOSURE" | "ASSURANCE";

export type RequirementGroup = {
  readonly code: string;
  readonly nameEn: string;
  readonly nameKo: string;
};

export type FrameworkDefinition = {
  readonly framework: ReportingFramework;
  readonly nameEn: string;
  readonly nameKo: string;
  readonly publisher: string;
  readonly version: string;
  readonly kind: FrameworkKind;
  /** True when the framework is legally mandated in at least one jurisdiction. */
  readonly isMandatory: boolean;
  readonly requirementGroups: readonly RequirementGroup[];
};

export const FRAMEWORK_DEFINITIONS: readonly FrameworkDefinition[] = [
  {
    framework: "GHG_PROTOCOL",
    nameEn: "GHG Protocol Corporate Standard",
    nameKo: "GHG 프로토콜 기업 표준",
    publisher: "World Resources Institute / WBCSD",
    version: "Revised Edition (2015) + Scope 2 & Scope 3 Guidance",
    kind: "ACCOUNTING",
    isMandatory: false,
    requirementGroups: [
      { code: "GHGP-BOUNDARY", nameEn: "Organizational & operational boundaries", nameKo: "조직·운영 경계" },
      { code: "GHGP-SCOPE1", nameEn: "Scope 1 direct emissions", nameKo: "Scope 1 직접 배출" },
      { code: "GHGP-SCOPE2", nameEn: "Scope 2 dual reporting", nameKo: "Scope 2 이중 보고" },
      { code: "GHGP-SCOPE3", nameEn: "Scope 3 value chain emissions", nameKo: "Scope 3 가치사슬 배출" },
      { code: "GHGP-BASEYEAR", nameEn: "Base year & recalculation policy", nameKo: "기준연도 및 재산정 정책" },
    ],
  },
  {
    framework: "ISO_14064",
    nameEn: "ISO 14064-1 GHG quantification and reporting",
    nameKo: "ISO 14064-1 온실가스 산정 및 보고",
    publisher: "ISO",
    version: "ISO 14064-1:2018",
    kind: "ACCOUNTING",
    isMandatory: false,
    requirementGroups: [
      { code: "ISO-4", nameEn: "GHG inventory design", nameKo: "온실가스 인벤토리 설계" },
      { code: "ISO-5", nameEn: "Quantification of emissions and removals", nameKo: "배출량 및 흡수량 정량화" },
      { code: "ISO-6", nameEn: "Mitigation activities", nameKo: "감축 활동" },
      { code: "ISO-8", nameEn: "GHG report content", nameKo: "온실가스 보고서 내용" },
      { code: "ISO-9", nameEn: "Verification role", nameKo: "검증 역할" },
    ],
  },
  {
    framework: "ISSB_S1",
    nameEn: "IFRS S1 General Sustainability-related Disclosures",
    nameKo: "IFRS S1 일반 지속가능성 공시",
    publisher: "IFRS Foundation / ISSB",
    version: "IFRS S1 (June 2023)",
    kind: "DISCLOSURE",
    isMandatory: true,
    requirementGroups: [
      { code: "S1-GOV", nameEn: "Governance", nameKo: "지배구조" },
      { code: "S1-STR", nameEn: "Strategy", nameKo: "전략" },
      { code: "S1-RM", nameEn: "Risk management", nameKo: "위험관리" },
      { code: "S1-MET", nameEn: "Metrics and targets", nameKo: "지표 및 목표" },
    ],
  },
  {
    framework: "ISSB_S2",
    nameEn: "IFRS S2 Climate-related Disclosures",
    nameKo: "IFRS S2 기후 관련 공시",
    publisher: "IFRS Foundation / ISSB",
    version: "IFRS S2 (June 2023)",
    kind: "DISCLOSURE",
    isMandatory: true,
    requirementGroups: [
      { code: "S2-GOV", nameEn: "Climate governance", nameKo: "기후 지배구조" },
      { code: "S2-STR", nameEn: "Climate strategy & resilience", nameKo: "기후 전략 및 회복력" },
      { code: "S2-RM", nameEn: "Climate risk management", nameKo: "기후 위험관리" },
      { code: "S2-MET", nameEn: "Cross-industry metrics (GHG, transition risk)", nameKo: "산업 공통 지표" },
      { code: "S2-IND", nameEn: "Industry-based metrics", nameKo: "산업별 지표" },
    ],
  },
  {
    framework: "CDP",
    nameEn: "CDP Climate Change Questionnaire",
    nameKo: "CDP 기후변화 질의서",
    publisher: "CDP",
    version: "2024 Corporate Questionnaire",
    kind: "DISCLOSURE",
    isMandatory: false,
    requirementGroups: [
      { code: "C1", nameEn: "Governance", nameKo: "지배구조" },
      { code: "C2", nameEn: "Risks and opportunities", nameKo: "위험과 기회" },
      { code: "C3", nameEn: "Business strategy", nameKo: "사업 전략" },
      { code: "C4", nameEn: "Targets and performance", nameKo: "목표 및 성과" },
      { code: "C5", nameEn: "Emissions methodology", nameKo: "배출량 산정 방법" },
      { code: "C6", nameEn: "Emissions data", nameKo: "배출량 데이터" },
      { code: "C7", nameEn: "Emissions breakdown", nameKo: "배출량 세부 내역" },
      { code: "C8", nameEn: "Energy", nameKo: "에너지" },
      { code: "C10", nameEn: "Verification", nameKo: "검증" },
      { code: "C11", nameEn: "Carbon pricing", nameKo: "탄소 가격" },
    ],
  },
  {
    framework: "CSRD",
    nameEn: "Corporate Sustainability Reporting Directive",
    nameKo: "기업 지속가능성 보고 지침",
    publisher: "European Commission",
    version: "Directive (EU) 2022/2464",
    kind: "DISCLOSURE",
    isMandatory: true,
    requirementGroups: [
      { code: "CSRD-19A", nameEn: "Sustainability reporting requirements", nameKo: "지속가능성 보고 요구사항" },
      { code: "CSRD-29A", nameEn: "Consolidated sustainability reporting", nameKo: "연결 지속가능성 보고" },
      { code: "CSRD-34", nameEn: "Assurance of sustainability reporting", nameKo: "지속가능성 보고 인증" },
      { code: "CSRD-8", nameEn: "EU Taxonomy alignment", nameKo: "EU 택소노미 정합성" },
    ],
  },
  {
    framework: "ESRS",
    nameEn: "European Sustainability Reporting Standards",
    nameKo: "유럽 지속가능성 보고 기준",
    publisher: "EFRAG",
    version: "Delegated Regulation (EU) 2023/2772",
    kind: "DISCLOSURE",
    isMandatory: true,
    requirementGroups: [
      { code: "ESRS2", nameEn: "General disclosures", nameKo: "일반 공시" },
      { code: "E1", nameEn: "Climate change", nameKo: "기후변화" },
      { code: "E2", nameEn: "Pollution", nameKo: "오염" },
      { code: "E3", nameEn: "Water and marine resources", nameKo: "수자원 및 해양자원" },
      { code: "E4", nameEn: "Biodiversity and ecosystems", nameKo: "생물다양성 및 생태계" },
      { code: "E5", nameEn: "Resource use and circular economy", nameKo: "자원 이용 및 순환경제" },
    ],
  },
  {
    framework: "TCFD",
    nameEn: "Task Force on Climate-related Financial Disclosures",
    nameKo: "기후 관련 재무정보 공개 협의체",
    publisher: "FSB TCFD",
    version: "2021 Implementing Guidance",
    kind: "DISCLOSURE",
    isMandatory: false,
    requirementGroups: [
      { code: "TCFD-GOV", nameEn: "Governance", nameKo: "지배구조" },
      { code: "TCFD-STR", nameEn: "Strategy", nameKo: "전략" },
      { code: "TCFD-RM", nameEn: "Risk management", nameKo: "위험관리" },
      { code: "TCFD-MT", nameEn: "Metrics and targets", nameKo: "지표 및 목표" },
    ],
  },
  {
    framework: "GRI",
    nameEn: "GRI 305: Emissions",
    nameKo: "GRI 305: 배출",
    publisher: "Global Reporting Initiative",
    version: "GRI 305:2016 (with GRI 1:2021)",
    kind: "DISCLOSURE",
    isMandatory: false,
    requirementGroups: [
      { code: "GRI-305", nameEn: "Emissions", nameKo: "배출" },
      { code: "GRI-302", nameEn: "Energy", nameKo: "에너지" },
      { code: "GRI-201", nameEn: "Economic performance (climate risk)", nameKo: "경제적 성과 (기후 위험)" },
    ],
  },
  {
    framework: "SASB",
    nameEn: "SASB Standards",
    nameKo: "SASB 기준",
    publisher: "IFRS Foundation (SASB)",
    version: "2023 Update",
    kind: "DISCLOSURE",
    isMandatory: false,
    requirementGroups: [
      { code: "SASB-GHG", nameEn: "GHG emissions", nameKo: "온실가스 배출" },
      { code: "SASB-ENE", nameEn: "Energy management", nameKo: "에너지 관리" },
      { code: "SASB-ACT", nameEn: "Activity metrics", nameKo: "활동 지표" },
    ],
  },
  {
    framework: "TNFD",
    nameEn: "Taskforce on Nature-related Financial Disclosures",
    nameKo: "자연 관련 재무정보 공개 협의체",
    publisher: "TNFD",
    version: "Recommendations v1.0 (2023)",
    kind: "DISCLOSURE",
    isMandatory: false,
    requirementGroups: [
      { code: "TNFD-GOV", nameEn: "Governance", nameKo: "지배구조" },
      { code: "TNFD-STR", nameEn: "Strategy", nameKo: "전략" },
      { code: "TNFD-RM", nameEn: "Risk and impact management", nameKo: "위험 및 영향 관리" },
      { code: "TNFD-MT", nameEn: "Metrics and targets", nameKo: "지표 및 목표" },
    ],
  },
];

const DEFINITION_BY_FRAMEWORK: Readonly<Record<ReportingFramework, FrameworkDefinition>> =
  Object.fromEntries(
    FRAMEWORK_DEFINITIONS.map((definition) => [definition.framework, definition]),
  ) as Record<ReportingFramework, FrameworkDefinition>;

export function frameworkDefinition(framework: ReportingFramework): FrameworkDefinition {
  return DEFINITION_BY_FRAMEWORK[framework];
}

export function isReportingFramework(value: string): value is ReportingFramework {
  return (REPORTING_FRAMEWORKS as readonly string[]).includes(value);
}
