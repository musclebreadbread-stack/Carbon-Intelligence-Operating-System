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
  },
  "action.error.CONFLICT": {
    en: "Someone else changed this record. Reload the page and try again.",
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
  },
  "action.error.internal": {
    en: "Something went wrong. The change was not saved.",
  },
  "action.error.INTERNAL_ERROR": {
    en: "Something went wrong. The change was not saved.",
  },
};

/** `action.success.<actionName>` — one entry per mutation the UI can invoke. */
export const SUCCESS_MESSAGES: Readonly<Record<string, MessageEntry>> = {
  "action.success.updateOrganization": { en: "Organization profile saved." },
  "action.success.createBusinessUnit": { en: "Business unit created." },
  "action.success.createFacility": { en: "Facility created." },
  "action.success.createBuilding": { en: "Building created." },
  "action.success.createProductionLine": { en: "Production line created." },
  "action.success.createEquipment": { en: "Equipment created." },
  "action.success.createEmissionSource": { en: "Emission source created." },

  "action.success.createSupplier": { en: "Supplier created." },
  "action.success.createProduct": { en: "Product created." },
  "action.success.createFuel": { en: "Fuel created." },
  "action.success.createVehicle": { en: "Vehicle created." },
  "action.success.createRefrigerant": { en: "Refrigerant created." },
  "action.success.createRawMaterial": { en: "Raw material created." },
  "action.success.createLogisticsRoute": { en: "Logistics route created." },
  "action.success.createEnergySource": { en: "Energy source created." },
  "action.success.createWasteType": { en: "Waste type created." },
  "action.success.createWaterSource": { en: "Water source created." },

  "action.success.createActivityData": { en: "Activity data set created." },
  "action.success.createActivityEntry": { en: "Activity entry saved." },
  "action.success.updateActivityEntry": { en: "Activity entry updated." },
  "action.success.recordMeterReading": { en: "Meter reading recorded." },

  "action.success.createEmissionFactor": { en: "Emission factor created." },
  "action.success.supersedeEmissionFactor": { en: "Emission factor superseded." },
  "action.success.createFactorSource": { en: "Factor source created." },
  "action.success.createFactorVersion": { en: "Factor version created." },
  "action.success.explainFactorResolution": { en: "Factor resolution explained." },
  "action.success.convertUnit": { en: "Unit converted." },

  "action.success.runCalculation": { en: "Calculation completed and persisted." },
  "action.success.previewCalculation": { en: "Calculation preview ready." },
  "action.success.publishInventory": { en: "Inventory published." },
  "action.success.executeRuleSet": { en: "Rule set executed." },
  "action.success.createRuleSet": { en: "Rule set created." },
  "action.success.setRuleSetActive": { en: "Rule set status updated." },

  "action.success.createTarget": { en: "Target created." },
  "action.success.generateTargetPathway": { en: "Target pathway generated." },
  "action.success.recordTargetProgress": { en: "Target progress recorded." },
  "action.success.commitNetZero": { en: "Net-zero commitment recorded." },

  "action.success.simulateScenario": { en: "Scenario simulated and persisted." },
  "action.success.previewScenario": { en: "Scenario projection ready." },
  "action.success.createScenario": { en: "Scenario created." },
  "action.success.compareScenarios": { en: "Scenarios compared." },
  "action.success.createCarbonBudget": { en: "Carbon budget created." },

  "action.success.buildRoadmap": { en: "Roadmap built." },
  "action.success.analyseInvestment": { en: "Investment analysed." },
  "action.success.selectMaccPortfolio": { en: "Abatement portfolio selected." },

  "action.success.retireCredits": { en: "Credits retired." },
  "action.success.createCarbonCredit": { en: "Carbon credit registered." },
  "action.success.setInternalCarbonPrice": { en: "Internal carbon price saved." },

  "action.success.generateDisclosureReport": { en: "Disclosure report generated." },
  "action.success.createDisclosureReport": { en: "Disclosure report created." },
  "action.success.saveDisclosureResponse": { en: "Response saved." },

  "action.success.createVerificationEngagement": { en: "Engagement created." },
  "action.success.recordFinding": { en: "Finding recorded." },
  "action.success.assessMateriality": { en: "Materiality assessed." },
  "action.success.submitEvidencePackage": { en: "Evidence package submitted." },
  "action.success.scoreVerificationReadiness": { en: "Readiness scored." },

  "action.success.runAnalysis": { en: "Analysis completed." },
  "action.success.resolveAnomaly": { en: "Anomaly resolved." },
  "action.success.executeAgentTask": { en: "Agent task executed." },
  "action.success.createAgent": { en: "Agent created." },
  "action.success.createAgentTask": { en: "Agent task queued." },
  "action.success.createDataSource": { en: "Data source created." },

  "action.success.signOut": { en: "Signed out." },
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
