/**
 * The 15 GHG Protocol Scope 3 categories (Corporate Value Chain Standard).
 *
 * Each entry declares the default calculation approach, the approaches the
 * category legitimately supports, and the minimum activity fields an entry must
 * carry for that approach to be computable — which is what the gap detector and
 * the Scope 3 engines validate against.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import {
  SCOPE3_CATEGORIES,
  type CalculationApproach,
  type Scope3Category,
} from "@/lib/core/enums";

export type ValueChainSide = "UPSTREAM" | "DOWNSTREAM";

export type Scope3CategoryDefinition = {
  readonly category: Scope3Category;
  /** 1–15, matching the GHG Protocol numbering. */
  readonly number: number;
  readonly nameEn: string;
  readonly nameKo: string;
  readonly side: ValueChainSide;
  readonly defaultApproach: CalculationApproach;
  readonly supportedApproaches: readonly CalculationApproach[];
  /** Fields required by the default approach. */
  readonly requiredFields: readonly string[];
  readonly descriptionKo: string;
};

export const SCOPE3_CATEGORY_DEFINITIONS: readonly Scope3CategoryDefinition[] = [
  {
    category: "CAT_1_PURCHASED_GOODS",
    number: 1,
    nameEn: "Purchased goods and services",
    nameKo: "구매한 상품 및 서비스",
    side: "UPSTREAM",
    defaultApproach: "SPEND_BASED",
    supportedApproaches: ["SPEND_BASED", "AVERAGE_DATA", "SUPPLIER_SPECIFIC", "HYBRID"],
    requiredFields: ["spend", "currency"],
    descriptionKo: "1차 협력사로부터 구매한 모든 상품 및 서비스의 상류 배출량",
  },
  {
    category: "CAT_2_CAPITAL_GOODS",
    number: 2,
    nameEn: "Capital goods",
    nameKo: "자본재",
    side: "UPSTREAM",
    defaultApproach: "SPEND_BASED",
    supportedApproaches: ["SPEND_BASED", "AVERAGE_DATA", "SUPPLIER_SPECIFIC"],
    requiredFields: ["spend", "currency"],
    descriptionKo: "설비·건물·차량 등 자본재 취득에 따른 상류 배출량 (취득 연도에 전량 인식)",
  },
  {
    category: "CAT_3_FUEL_ENERGY",
    number: 3,
    nameEn: "Fuel- and energy-related activities",
    nameKo: "연료 및 에너지 관련 활동",
    side: "UPSTREAM",
    defaultApproach: "ACTIVITY_BASED",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA"],
    requiredFields: ["quantity", "unit"],
    descriptionKo: "Scope 1·2에 포함되지 않은 연료 채굴·수송·정제(WTT) 및 송배전 손실 배출량",
  },
  {
    category: "CAT_4_UPSTREAM_TRANSPORT",
    number: 4,
    nameEn: "Upstream transportation and distribution",
    nameKo: "상류 운송 및 유통",
    side: "UPSTREAM",
    defaultApproach: "ACTIVITY_BASED",
    supportedApproaches: ["ACTIVITY_BASED", "SPEND_BASED", "SUPPLIER_SPECIFIC"],
    requiredFields: ["mass", "distance", "mode"],
    descriptionKo: "구매한 물류 서비스 및 1차 협력사와의 사이의 운송·물류 배출량",
  },
  {
    category: "CAT_5_WASTE",
    number: 5,
    nameEn: "Waste generated in operations",
    nameKo: "사업장 폐기물",
    side: "UPSTREAM",
    defaultApproach: "ACTIVITY_BASED",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA", "SUPPLIER_SPECIFIC"],
    requiredFields: ["mass", "treatmentMethod"],
    descriptionKo: "사업장에서 발생한 폐기물의 처리·폐수 처리 과정에서의 배출량",
  },
  {
    category: "CAT_6_BUSINESS_TRAVEL",
    number: 6,
    nameEn: "Business travel",
    nameKo: "임직원 출장",
    side: "UPSTREAM",
    defaultApproach: "ACTIVITY_BASED",
    supportedApproaches: ["ACTIVITY_BASED", "SPEND_BASED", "AVERAGE_DATA"],
    requiredFields: ["distance", "mode"],
    descriptionKo: "항공·철도·차량·숙박 등 임직원 출장에 따른 배출량",
  },
  {
    category: "CAT_7_EMPLOYEE_COMMUTING",
    number: 7,
    nameEn: "Employee commuting",
    nameKo: "임직원 통근",
    side: "UPSTREAM",
    defaultApproach: "AVERAGE_DATA",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA"],
    requiredFields: ["employeeCount", "workingDays", "distance", "mode"],
    descriptionKo: "임직원 통근 및 재택근무에 따른 배출량",
  },
  {
    category: "CAT_8_UPSTREAM_LEASED",
    number: 8,
    nameEn: "Upstream leased assets",
    nameKo: "임차 자산 (상류)",
    side: "UPSTREAM",
    defaultApproach: "ACTIVITY_BASED",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA", "SUPPLIER_SPECIFIC"],
    requiredFields: ["quantity", "unit"],
    descriptionKo: "보고 조직이 임차하여 사용하지만 Scope 1·2에 포함되지 않은 자산의 배출량",
  },
  {
    category: "CAT_9_DOWNSTREAM_TRANSPORT",
    number: 9,
    nameEn: "Downstream transportation and distribution",
    nameKo: "하류 운송 및 유통",
    side: "DOWNSTREAM",
    defaultApproach: "ACTIVITY_BASED",
    supportedApproaches: ["ACTIVITY_BASED", "SPEND_BASED", "AVERAGE_DATA"],
    requiredFields: ["mass", "distance", "mode"],
    descriptionKo: "판매된 제품의 최종 소비자까지의 운송·보관·소매 배출량",
  },
  {
    category: "CAT_10_PROCESSING",
    number: 10,
    nameEn: "Processing of sold products",
    nameKo: "판매 제품의 가공",
    side: "DOWNSTREAM",
    defaultApproach: "AVERAGE_DATA",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA", "SUPPLIER_SPECIFIC"],
    requiredFields: ["mass", "processingFactor"],
    descriptionKo: "중간재를 구매한 하류 기업의 가공 과정에서 발생하는 배출량",
  },
  {
    category: "CAT_11_USE_OF_SOLD",
    number: 11,
    nameEn: "Use of sold products",
    nameKo: "판매 제품의 사용",
    side: "DOWNSTREAM",
    defaultApproach: "ACTIVITY_BASED",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA"],
    requiredFields: ["unitsSold", "lifetimeUses", "energyPerUse"],
    descriptionKo: "판매 제품의 사용 단계 배출량 (직접 사용 단계 및 간접 사용 단계)",
  },
  {
    category: "CAT_12_END_OF_LIFE",
    number: 12,
    nameEn: "End-of-life treatment of sold products",
    nameKo: "판매 제품의 폐기",
    side: "DOWNSTREAM",
    defaultApproach: "AVERAGE_DATA",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA"],
    requiredFields: ["mass", "treatmentMethod"],
    descriptionKo: "판매 제품 및 포장재의 수명 종료 시 폐기 처리 배출량",
  },
  {
    category: "CAT_13_DOWNSTREAM_LEASED",
    number: 13,
    nameEn: "Downstream leased assets",
    nameKo: "임대 자산 (하류)",
    side: "DOWNSTREAM",
    defaultApproach: "ACTIVITY_BASED",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA"],
    requiredFields: ["quantity", "unit"],
    descriptionKo: "보고 조직이 타 기업에 임대한 자산의 운영 배출량",
  },
  {
    category: "CAT_14_FRANCHISES",
    number: 14,
    nameEn: "Franchises",
    nameKo: "프랜차이즈",
    side: "DOWNSTREAM",
    defaultApproach: "AVERAGE_DATA",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA", "SUPPLIER_SPECIFIC"],
    requiredFields: ["franchiseCount", "quantity", "unit"],
    descriptionKo: "프랜차이즈 가맹점의 Scope 1·2에 해당하는 배출량",
  },
  {
    category: "CAT_15_INVESTMENTS",
    number: 15,
    nameEn: "Investments",
    nameKo: "투자",
    side: "DOWNSTREAM",
    defaultApproach: "AVERAGE_DATA",
    supportedApproaches: ["ACTIVITY_BASED", "AVERAGE_DATA", "SPEND_BASED"],
    requiredFields: ["investeeEmissions", "attributionShare"],
    descriptionKo: "지분 투자·부채 투자·프로젝트 파이낸스에 귀속되는 배출량 (PCAF)",
  },
];

const DEFINITION_BY_CATEGORY: Readonly<Record<Scope3Category, Scope3CategoryDefinition>> =
  Object.fromEntries(
    SCOPE3_CATEGORY_DEFINITIONS.map((definition) => [definition.category, definition]),
  ) as Record<Scope3Category, Scope3CategoryDefinition>;

export function scope3Definition(category: Scope3Category): Scope3CategoryDefinition {
  return DEFINITION_BY_CATEGORY[category];
}

export function isScope3Category(value: string): value is Scope3Category {
  return (SCOPE3_CATEGORIES as readonly string[]).includes(value);
}

export function upstreamCategories(): readonly Scope3CategoryDefinition[] {
  return SCOPE3_CATEGORY_DEFINITIONS.filter((d) => d.side === "UPSTREAM");
}

export function downstreamCategories(): readonly Scope3CategoryDefinition[] {
  return SCOPE3_CATEGORY_DEFINITIONS.filter((d) => d.side === "DOWNSTREAM");
}
