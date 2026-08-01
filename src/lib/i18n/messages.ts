/**
 * Message table for the two `messageKey` namespaces the action layer emits.
 *
 * `src/lib/actions/**` never formats user-facing copy for a specific language: it
 * returns an English `message` plus a stable `messageKey` (`action.success.<name>`
 * or `action.error.<CODE>`). This module is the single place those keys are turned
 * into display strings, which makes it the seam for the deferred Korean UI
 * translation: adding a `ko` column here localises every form in the application
 * without touching an action or a page.
 *
 * Per the plan's UI-language assumption the application UI stays English; only
 * configuration notices are Korean, so `ko` is populated for the keys a user sees
 * while the deployment is unconfigured and left to fall back elsewhere.
 *
 * Pure data plus two lookups — no framework imports, so both server and client
 * components can use it.
 */

import { DEFAULT_LOCALE, LOCALES } from "./locales";
import type { Locale } from "./locales";

export { DEFAULT_LOCALE, LOCALES };
export type { Locale };

export type MessageEntry = {
  readonly en: string;
  readonly ko?: string;
};

/**
 * `action.error.<CODE>` — one entry per `ActionErrorCode`, plus the legacy
 * `AppError`-derived keys `toActionError` can emit (`action.error.<error.code>`)
 * and the neutral `action.idle` used as `useActionState`'s initial value.
 */
export const ERROR_MESSAGES: Readonly<Record<string, MessageEntry>> = {
  "action.idle": { en: "" },

  "action.error.UNAUTHORIZED": {
    en: "Your session has expired. Sign in again to continue.",
    ko: "세션이 만료되었습니다. 다시 로그인해 주세요.",
  },
  "action.error.forbidden": {
    en: "You do not have permission to do this. Ask an administrator to grant it.",
    ko: "권한이 없습니다. 관리자에게 권한 부여를 요청하세요.",
  },
  "action.error.FORBIDDEN": {
    en: "You do not have permission to do this. Ask an administrator to grant it.",
    ko: "권한이 없습니다. 관리자에게 권한 부여를 요청하세요.",
  },
  "action.error.validation": {
    en: "Some values need attention before this can be saved.",
    ko: "저장하기 전에 확인이 필요한 값이 있습니다.",
  },
  "action.error.VALIDATION_ERROR": {
    en: "Some values need attention before this can be saved.",
    ko: "저장하기 전에 확인이 필요한 값이 있습니다.",
  },
  "action.error.NOT_FOUND": {
    en: "That record no longer exists. Reload the page and try again.",
    ko: "해당 레코드가 존재하지 않습니다. 페이지를 새로고침한 후 다시 시도하세요.",
  },
  "action.error.CONFLICT": {
    en: "Someone else changed this record. Reload the page and try again.",
    ko: "다른 사용자가 이 레코드를 변경했습니다. 페이지를 새로고침한 후 다시 시도하세요.",
  },
  "action.error.demoMode": {
    en: "No database is configured, so this change was not saved. Every figure shown is still computed from the bundled sample data by the real calculation engines.",
    ko: "데이터베이스가 구성되지 않아 변경 내용이 저장되지 않았습니다. 화면의 모든 수치는 내장 샘플 데이터를 실제 계산 엔진으로 계산한 값입니다.",
  },
  "action.error.DEMO_MODE": {
    en: "No database is configured, so this change was not saved. Every figure shown is still computed from the bundled sample data by the real calculation engines.",
    ko: "데이터베이스가 구성되지 않아 변경 내용이 저장되지 않았습니다. 화면의 모든 수치는 내장 샘플 데이터를 실제 계산 엔진으로 계산한 값입니다.",
  },
  "action.error.CALCULATION_ERROR": {
    en: "The calculation could not be completed with the values supplied.",
    ko: "제공된 값으로 계산을 완료할 수 없습니다.",
  },
  "action.error.LLM_ERROR": {
    en: "The language model is unavailable, so no narrative was generated. The numeric result is unaffected.",
    ko: "언어 모델을 사용할 수 없어 서술이 생성되지 않았습니다. 수치 결과에는 영향이 없습니다.",
  },
  "action.error.LLM_NOT_CONFIGURED": {
    en: "No OPENAI_API_KEY is configured, so narrative text is generated deterministically.",
    ko: "OPENAI_API_KEY가 설정되지 않아 서술이 결정론적으로 생성됩니다.",
  },
  "action.error.RATE_LIMITED": {
    en: "Too many requests. Wait a moment and try again.",
    ko: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  },
  "action.error.internal": {
    en: "Something went wrong. The change was not saved.",
    ko: "오류가 발생했습니다. 변경 내용이 저장되지 않았습니다.",
  },
  "action.error.INTERNAL_ERROR": {
    en: "Something went wrong. The change was not saved.",
    ko: "오류가 발생했습니다. 변경 내용이 저장되지 않았습니다.",
  },
  "action.error.PERIOD_LOCKED": {
    en: "This period is locked. Unlock it before making changes.",
    ko: "이 기간은 잠겨 있습니다. 변경하려면 먼저 잠금을 해제하세요.",
  },
};

/** `action.success.<actionName>` — one entry per mutation the UI can invoke. */
export const SUCCESS_MESSAGES: Readonly<Record<string, MessageEntry>> = {
  "action.success.updateOrganization": { en: "Organization profile saved.", ko: "조직 프로필이 저장되었습니다." },
  "action.success.createBusinessUnit": { en: "Business unit created.", ko: "사업부가 생성되었습니다." },
  "action.success.createFacility": { en: "Facility created.", ko: "시설이 생성되었습니다." },
  "action.success.createBuilding": { en: "Building created.", ko: "건물이 생성되었습니다." },
  "action.success.createProductionLine": { en: "Production line created.", ko: "생산라인이 생성되었습니다." },
  "action.success.createEquipment": { en: "Equipment created.", ko: "장비가 생성되었습니다." },
  "action.success.createEmissionSource": { en: "Emission source created.", ko: "배출원이 생성되었습니다." },

  "action.success.createSupplier": { en: "Supplier created.", ko: "공급업체가 생성되었습니다." },
  "action.success.createProduct": { en: "Product created.", ko: "제품이 생성되었습니다." },
  "action.success.createFuel": { en: "Fuel created.", ko: "연료가 생성되었습니다." },
  "action.success.createVehicle": { en: "Vehicle created.", ko: "차량이 생성되었습니다." },
  "action.success.createRefrigerant": { en: "Refrigerant created.", ko: "냉매가 생성되었습니다." },
  "action.success.createRawMaterial": { en: "Raw material created.", ko: "원자재가 생성되었습니다." },
  "action.success.createLogisticsRoute": { en: "Logistics route created.", ko: "물류 경로가 생성되었습니다." },
  "action.success.createEnergySource": { en: "Energy source created.", ko: "에너지원이 생성되었습니다." },
  "action.success.createWasteType": { en: "Waste type created.", ko: "폐기물 유형이 생성되었습니다." },
  "action.success.createWaterSource": { en: "Water source created.", ko: "수원이 생성되었습니다." },

  "action.success.createActivityData": { en: "Activity data set created.", ko: "활동자료 세트가 생성되었습니다." },
  "action.success.createActivityEntry": { en: "Activity entry saved.", ko: "활동 항목이 저장되었습니다." },
  "action.success.updateActivityEntry": { en: "Activity entry updated.", ko: "활동 항목이 수정되었습니다." },
  "action.success.recordMeterReading": { en: "Meter reading recorded.", ko: "계량기 판독이 기록되었습니다." },

  "action.success.createEmissionFactor": { en: "Emission factor created.", ko: "배출계수가 생성되었습니다." },
  "action.success.supersedeEmissionFactor": { en: "Emission factor superseded.", ko: "배출계수가 대체되었습니다." },
  "action.success.createFactorSource": { en: "Factor source created.", ko: "계수 출처가 생성되었습니다." },
  "action.success.createFactorVersion": { en: "Factor version created.", ko: "계수 버전이 생성되었습니다." },
  "action.success.explainFactorResolution": { en: "Factor resolution explained.", ko: "계수 해석이 설명되었습니다." },
  "action.success.convertUnit": { en: "Unit converted.", ko: "단위가 환산되었습니다." },

  "action.success.runCalculation": { en: "Calculation completed and persisted.", ko: "계산이 완료되어 저장되었습니다." },
  "action.success.previewCalculation": { en: "Calculation preview ready.", ko: "계산 미리보기가 준비되었습니다." },
  "action.success.publishInventory": { en: "Inventory published.", ko: "인벤토리가 게시되었습니다." },
  "action.success.executeRuleSet": { en: "Rule set executed.", ko: "규칙 세트가 실행되었습니다." },
  "action.success.createRuleSet": { en: "Rule set created.", ko: "규칙 세트가 생성되었습니다." },
  "action.success.setRuleSetActive": { en: "Rule set status updated.", ko: "규칙 세트 상태가 업데이트되었습니다." },

  "action.success.createTarget": { en: "Target created.", ko: "목표가 생성되었습니다." },
  "action.success.generateTargetPathway": { en: "Target pathway generated.", ko: "목표 경로가 생성되었습니다." },
  "action.success.recordTargetProgress": { en: "Target progress recorded.", ko: "목표 진행률이 기록되었습니다." },
  "action.success.commitNetZero": { en: "Net-zero commitment recorded.", ko: "넷제로 약속이 기록되었습니다." },

  "action.success.simulateScenario": { en: "Scenario simulated and persisted.", ko: "시나리오 시뮬레이션이 완료되어 저장되었습니다." },
  "action.success.previewScenario": { en: "Scenario projection ready.", ko: "시나리오 전망이 준비되었습니다." },
  "action.success.createScenario": { en: "Scenario created.", ko: "시나리오가 생성되었습니다." },
  "action.success.compareScenarios": { en: "Scenarios compared.", ko: "시나리오가 비교되었습니다." },
  "action.success.createCarbonBudget": { en: "Carbon budget created.", ko: "탄소 예산이 생성되었습니다." },

  "action.success.buildRoadmap": { en: "Roadmap built.", ko: "로드맵이 구축되었습니다." },
  "action.success.analyseInvestment": { en: "Investment analysed.", ko: "투자 분석이 완료되었습니다." },
  "action.success.selectMaccPortfolio": { en: "Abatement portfolio selected.", ko: "감축 포트폴리오가 선택되었습니다." },

  "action.success.retireCredits": { en: "Credits retired.", ko: "크레딧이 소각되었습니다." },
  "action.success.createCarbonCredit": { en: "Carbon credit registered.", ko: "탄소 크레딧이 등록되었습니다." },
  "action.success.setInternalCarbonPrice": { en: "Internal carbon price saved.", ko: "내부 탄소 가격이 저장되었습니다." },

  "action.success.generateDisclosureReport": { en: "Disclosure report generated.", ko: "공시 보고서가 생성되었습니다." },
  "action.success.createDisclosureReport": { en: "Disclosure report created.", ko: "공시 보고서가 생성되었습니다." },
  "action.success.saveDisclosureResponse": { en: "Response saved.", ko: "응답이 저장되었습니다." },

  "action.success.createVerificationEngagement": { en: "Engagement created.", ko: "검증 계약이 생성되었습니다." },
  "action.success.recordFinding": { en: "Finding recorded.", ko: "발견사항이 기록되었습니다." },
  "action.success.assessMateriality": { en: "Materiality assessed.", ko: "중요성이 평가되었습니다." },
  "action.success.submitEvidencePackage": { en: "Evidence package submitted.", ko: "증거 패키지가 제출되었습니다." },
  "action.success.scoreVerificationReadiness": { en: "Readiness scored.", ko: "준비도가 점수화되었습니다." },

  "action.success.runAnalysis": { en: "Analysis completed.", ko: "분석이 완료되었습니다." },
  "action.success.resolveAnomaly": { en: "Anomaly resolved.", ko: "이상이 해결되었습니다." },
  "action.success.executeAgentTask": { en: "Agent task executed.", ko: "에이전트 작업이 실행되었습니다." },
  "action.success.createAgent": { en: "Agent created.", ko: "에이전트가 생성되었습니다." },
  "action.success.createAgentTask": { en: "Agent task queued.", ko: "에이전트 작업이 대기열에 추가되었습니다." },
  "action.success.createDataSource": { en: "Data source created.", ko: "데이터 소스가 생성되었습니다." },

  "action.success.signOut": { en: "Signed out.", ko: "로그아웃되었습니다." },

  "action.success.requestClose": { en: "Period close requested.", ko: "기간 마감이 요청되었습니다." },
  "action.success.approveClose": { en: "Period close approved.", ko: "기간 마감이 승인되었습니다." },
  "action.success.rejectClose": { en: "Period close rejected.", ko: "기간 마감이 거부되었습니다." },
  "action.success.unlockPeriod": { en: "Period unlocked.", ko: "기간 잠금이 해제되었습니다." },
  "action.success.uploadEvidence": { en: "Evidence uploaded.", ko: "증거가 업로드되었습니다." },
};

/** Every key the table knows, both namespaces merged. */
export const MESSAGES: Readonly<Record<string, MessageEntry>> = {
  ...ERROR_MESSAGES,
  ...SUCCESS_MESSAGES,
};

/**
 * Resolves a `messageKey` for display.
 *
 * `fallback` is the English `message` the action already returned, so an action
 * added later still renders sensibly before its key is added to the table.
 */
export function resolveMessage(
  key: string | undefined,
  fallback = "",
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!key) return fallback;
  const entry = MESSAGES[key];
  if (!entry) return fallback;
  if (locale === "ko" && entry.ko) return entry.ko;
  return entry.en.length > 0 ? entry.en : fallback;
}

/** The Korean string for a key, or `null` when none is authored. */
export function koreanMessage(key: string | undefined): string | null {
  if (!key) return null;
  return MESSAGES[key]?.ko ?? null;
}

/** Path of the Korean setup guide the demo-mode notices link to. */
export const SETUP_GUIDE_PATH = "docs/CIOS-직접-설정-가이드.docx";
