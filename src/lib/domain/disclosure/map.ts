/**
 * Inventory → disclosure mapping, completeness scoring and report assembly.
 *
 * `mapInventoryToRequirements` answers every requirement that carries a `metric`
 * straight from the calculated inventory, so the same numbers appear in CDP, ESRS
 * E1, IFRS S2 and GRI 305 without being retyped — the single biggest source of
 * disclosure error. Requirements with no metric are left unanswered on purpose:
 * `completeness` then reports exactly which mandatory narrative items a human
 * still has to write.
 *
 * `assembleReport` folds the responses into the framework's own requirement-group
 * tree, which is the section structure `ReportGeneration` renders.
 *
 * Records are shaped to `DisclosureResponse` and `DisclosureReport`.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type {
  DisclosureStatus,
  GwpVersion,
  ReportingFramework,
  Scope3Category,
} from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { roundTo, safeDivide } from "@/lib/core/number";
import { frameworkDefinition } from "@/lib/reference/frameworks";

import type { InventoryTotals } from "../emissions/aggregate";

import {
  requirementsFor,
  type DisclosureRequirementDefinition,
} from "./requirements";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Everything the mapper can draw on. `inventory` is the output of
 * `buildInventory`; the rest are the organisation-level figures no inventory
 * carries on its own.
 */
export type DisclosureContext = {
  readonly inventory: InventoryTotals;
  readonly reportingYear: number;
  readonly gwpVersion?: GwpVersion;
  readonly consolidationApproach?: string;
  /** Net revenue, for the intensity datapoints. */
  readonly revenue?: number;
  readonly revenueUnit?: string;
  readonly energyConsumption?: number;
  /** Renewable share of consumed energy, 0..1. Reported as a percentage. */
  readonly renewableShare?: number;
  readonly internalCarbonPrice?: number;
  readonly retiredCredits?: number;
  readonly baseYear?: number;
  readonly baseYearEmissions?: number;
  /** Decimal places applied to auto-populated numbers. */
  readonly decimalPlaces?: number;
};

/** One response, shaped to `DisclosureResponse`. */
export type DisclosureResponseRecord = {
  readonly requirementCode: string;
  readonly framework: ReportingFramework;
  readonly value: string | null;
  readonly numericValue: number | null;
  readonly status: DisclosureStatus;
  readonly notes: string | null;
  readonly unit: string | null;
  /** True when the value came from the inventory rather than from a person. */
  readonly isAutoPopulated: boolean;
};

export type MappingResult = {
  readonly framework: ReportingFramework;
  readonly responses: readonly DisclosureResponseRecord[];
  /** Codes answered from the inventory. */
  readonly populatedCodes: readonly string[];
  /**
   * Codes that declare a metric the context could not supply, e.g. an intensity
   * datapoint with no revenue.
   */
  readonly unavailableCodes: readonly string[];
  /** Codes with no metric at all: narrative that must be authored. */
  readonly narrativeCodes: readonly string[];
  readonly reportingYear: number;
};

type MetricValue = { readonly numeric: number | null; readonly text: string | null };

function metricFor(
  requirement: DisclosureRequirementDefinition,
  context: DisclosureContext,
): MetricValue | null {
  const inventory = context.inventory;
  const dp = context.decimalPlaces ?? 3;
  const numeric = (value: number | undefined | null): MetricValue | null =>
    value === undefined || value === null || !Number.isFinite(value)
      ? null
      : { numeric: roundTo(value, dp), text: null };

  switch (requirement.metric) {
    case "scope1Total":
      return numeric(inventory.scope1Total);
    case "scope2Location":
      return numeric(inventory.scope2Location);
    case "scope2Market":
      return numeric(inventory.scope2Market);
    case "scope3Total":
      return numeric(inventory.scope3Total);
    case "totalEmissions":
      return numeric(inventory.totalEmissions);
    case "biogenicCO2":
      return numeric(inventory.biogenicCO2);
    case "scope3Category": {
      const category = requirement.scope3Category as Scope3Category | undefined;
      if (category === undefined) return null;
      const value = inventory.scope3ByCategory[category];
      return value === undefined ? null : numeric(value);
    }
    case "intensityRevenue":
      return context.revenue === undefined || context.revenue === 0
        ? null
        : numeric(safeDivide(inventory.totalEmissions, context.revenue));
    case "energyConsumption":
      return numeric(context.energyConsumption);
    case "renewableShare":
      return context.renewableShare === undefined
        ? null
        : numeric(context.renewableShare * 100);
    case "internalCarbonPrice":
      return numeric(context.internalCarbonPrice);
    case "retiredCredits":
      return numeric(context.retiredCredits);
    case "baseYear":
      return context.baseYear === undefined
        ? null
        : { numeric: context.baseYear, text: String(context.baseYear) };
    case "baseYearEmissions":
      return numeric(context.baseYearEmissions);
    case "reportingYear":
      return { numeric: context.reportingYear, text: String(context.reportingYear) };
    case "gwpVersion":
      return context.gwpVersion === undefined
        ? null
        : { numeric: null, text: context.gwpVersion };
    case "consolidationApproach":
      return context.consolidationApproach === undefined
        ? null
        : { numeric: null, text: context.consolidationApproach };
    case "scope2Basis":
      return { numeric: null, text: inventory.scope2Basis };
    case undefined:
      return null;
    default: {
      const exhaustive: never = requirement.metric;
      throw new CalculationError("Unknown disclosure metric", { metric: exhaustive });
    }
  }
}

/**
 * Auto-populates every requirement the inventory can answer.
 *
 * A requirement with no answer still gets a response row, in `NOT_STARTED`
 * status, so the completeness report and the UI have a stable row per
 * requirement rather than an implicit absence.
 */
export function mapInventoryToRequirements(
  context: DisclosureContext,
  framework: ReportingFramework,
): MappingResult {
  const requirements = requirementsFor(framework);
  if (requirements.length === 0) {
    throw new CalculationError(
      `No disclosure requirements are catalogued for ${framework}`,
      { framework },
    );
  }

  const populatedCodes: string[] = [];
  const unavailableCodes: string[] = [];
  const narrativeCodes: string[] = [];

  const responses: DisclosureResponseRecord[] = requirements.map((requirement) => {
    if (requirement.metric === undefined) {
      narrativeCodes.push(requirement.code);
      return {
        requirementCode: requirement.code,
        framework,
        value: null,
        numericValue: null,
        status: "NOT_STARTED" as DisclosureStatus,
        notes: "Narrative disclosure: requires input from the reporting team.",
        unit: requirement.unit ?? null,
        isAutoPopulated: false,
      };
    }

    const resolved = metricFor(requirement, context);
    if (resolved === null) {
      unavailableCodes.push(requirement.code);
      return {
        requirementCode: requirement.code,
        framework,
        value: null,
        numericValue: null,
        status: "NOT_STARTED" as DisclosureStatus,
        notes: `No value available for metric "${requirement.metric}" in the ${context.reportingYear} inventory.`,
        unit: requirement.unit ?? null,
        isAutoPopulated: false,
      };
    }

    populatedCodes.push(requirement.code);
    const unit = requirement.unit ?? null;
    return {
      requirementCode: requirement.code,
      framework,
      value:
        resolved.text ??
        (resolved.numeric === null
          ? null
          : `${resolved.numeric}${unit === null ? "" : ` ${unit}`}`),
      numericValue: resolved.numeric,
      status: "DRAFT" as DisclosureStatus,
      notes: `Auto-populated from the ${context.reportingYear} calculated inventory (metric "${requirement.metric}").`,
      unit,
      isAutoPopulated: true,
    };
  });

  return {
    framework,
    responses,
    populatedCodes,
    unavailableCodes,
    narrativeCodes,
    reportingYear: context.reportingYear,
  };
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/** A stored response, as the completeness check sees it. */
export type ResponseLike = {
  readonly requirementCode: string;
  readonly value?: string | null;
  readonly numericValue?: number | null;
  readonly status?: DisclosureStatus;
};

export type CategoryCompleteness = {
  readonly category: string;
  readonly total: number;
  readonly answered: number;
  readonly percent: number;
  readonly mandatoryTotal: number;
  readonly mandatoryAnswered: number;
  readonly mandatoryPercent: number;
};

export type CompletenessGap = {
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly isMandatory: boolean;
};

export type CompletenessReport = {
  readonly total: number;
  readonly answered: number;
  readonly percent: number;
  readonly mandatoryTotal: number;
  readonly mandatoryAnswered: number;
  readonly mandatoryPercent: number;
  readonly byCategory: readonly CategoryCompleteness[];
  readonly unansweredMandatory: readonly CompletenessGap[];
  readonly unanswered: readonly CompletenessGap[];
  /** Responses whose requirement code is not in the catalogue. */
  readonly orphanResponseCodes: readonly string[];
  readonly isComplete: boolean;
};

/** A response counts as answered once it carries a value and has left NOT_STARTED. */
export function isAnswered(response: ResponseLike | undefined): boolean {
  if (!response) return false;
  if ((response.status ?? "NOT_STARTED") === "NOT_STARTED") return false;
  if (response.numericValue !== undefined && response.numericValue !== null) return true;
  return typeof response.value === "string" && response.value.trim().length > 0;
}

/**
 * Scores a response set against a requirement list.
 *
 * Percentages are reported both overall and per requirement group, and the exact
 * mandatory gaps are listed — a percentage alone is not actionable.
 */
export function completeness(
  responses: readonly ResponseLike[],
  requirements: readonly DisclosureRequirementDefinition[],
): CompletenessReport {
  if (requirements.length === 0) {
    throw new CalculationError("completeness requires at least one requirement", {});
  }
  const byCode = new Map(responses.map((response) => [response.requirementCode, response]));
  const codes = new Set(requirements.map((requirement) => requirement.code));

  const unansweredMandatory: CompletenessGap[] = [];
  const unanswered: CompletenessGap[] = [];
  const categories = new Map<
    string,
    { total: number; answered: number; mandatoryTotal: number; mandatoryAnswered: number }
  >();

  let answered = 0;
  let mandatoryTotal = 0;
  let mandatoryAnswered = 0;

  for (const requirement of requirements) {
    const done = isAnswered(byCode.get(requirement.code));
    const bucket =
      categories.get(requirement.category) ??
      { total: 0, answered: 0, mandatoryTotal: 0, mandatoryAnswered: 0 };
    bucket.total += 1;
    if (done) {
      answered += 1;
      bucket.answered += 1;
    } else {
      const gap: CompletenessGap = {
        code: requirement.code,
        name: requirement.name,
        category: requirement.category,
        isMandatory: requirement.isMandatory,
      };
      unanswered.push(gap);
      if (requirement.isMandatory) unansweredMandatory.push(gap);
    }
    if (requirement.isMandatory) {
      mandatoryTotal += 1;
      bucket.mandatoryTotal += 1;
      if (done) {
        mandatoryAnswered += 1;
        bucket.mandatoryAnswered += 1;
      }
    }
    categories.set(requirement.category, bucket);
  }

  const byCategory: CategoryCompleteness[] = [...categories.entries()].map(
    ([category, bucket]) => ({
      category,
      total: bucket.total,
      answered: bucket.answered,
      percent: safeDivide(bucket.answered, bucket.total) * 100,
      mandatoryTotal: bucket.mandatoryTotal,
      mandatoryAnswered: bucket.mandatoryAnswered,
      mandatoryPercent:
        bucket.mandatoryTotal === 0
          ? 100
          : safeDivide(bucket.mandatoryAnswered, bucket.mandatoryTotal) * 100,
    }),
  );

  return {
    total: requirements.length,
    answered,
    percent: safeDivide(answered, requirements.length) * 100,
    mandatoryTotal,
    mandatoryAnswered,
    mandatoryPercent:
      mandatoryTotal === 0 ? 100 : safeDivide(mandatoryAnswered, mandatoryTotal) * 100,
    byCategory,
    unansweredMandatory,
    unanswered,
    orphanResponseCodes: responses
      .map((response) => response.requirementCode)
      .filter((code) => !codes.has(code)),
    isComplete: unansweredMandatory.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

export type ReportRequirementRow = {
  readonly code: string;
  readonly name: string;
  readonly nameKo: string;
  readonly description: string;
  readonly isMandatory: boolean;
  readonly dataType: string;
  readonly value: string | null;
  readonly numericValue: number | null;
  readonly unit: string | null;
  readonly status: DisclosureStatus;
  readonly isAnswered: boolean;
};

export type ReportSectionNode = {
  readonly code: string;
  readonly title: string;
  readonly titleKo: string;
  readonly orderIndex: number;
  readonly requirements: readonly ReportRequirementRow[];
  readonly completeness: CategoryCompleteness | null;
};

export type AssembledReport = {
  readonly framework: ReportingFramework;
  readonly name: string;
  readonly publisher: string;
  readonly version: string;
  readonly reportingYear: number;
  readonly sections: readonly ReportSectionNode[];
  readonly completeness: CompletenessReport;
  readonly status: DisclosureStatus;
  /** Headline figures repeated at report level, for the cover page. */
  readonly headline: {
    readonly scope1: number;
    readonly scope2Location: number;
    readonly scope2Market: number;
    readonly scope3: number;
    readonly total: number;
    readonly unit: string;
  };
};

/**
 * Folds responses into the framework's requirement-group tree.
 *
 * Sections follow the order the framework declares its groups in, and groups with
 * no catalogued requirements are omitted rather than rendered empty. The report
 * status is derived from the mandatory completeness so a half-finished report
 * cannot be labelled `SUBMITTED`.
 */
export function assembleReport(
  framework: ReportingFramework,
  responses: readonly ResponseLike[],
  context: DisclosureContext,
): AssembledReport {
  const definition = frameworkDefinition(framework);
  if (!definition) {
    throw new CalculationError(`Unknown reporting framework: ${framework}`, { framework });
  }
  const requirements = requirementsFor(framework);
  const report = completeness(responses, requirements);
  const byCode = new Map(responses.map((response) => [response.requirementCode, response]));
  const completenessByCategory = new Map(
    report.byCategory.map((entry) => [entry.category, entry]),
  );

  const sections: ReportSectionNode[] = [];
  definition.requirementGroups.forEach((group, index) => {
    const groupRequirements = requirements.filter(
      (requirement) => requirement.category === group.code,
    );
    if (groupRequirements.length === 0) return;
    sections.push({
      code: group.code,
      title: group.nameEn,
      titleKo: group.nameKo,
      orderIndex: index,
      requirements: groupRequirements.map((requirement) => {
        const response = byCode.get(requirement.code);
        return {
          code: requirement.code,
          name: requirement.name,
          nameKo: requirement.nameKo,
          description: requirement.description,
          isMandatory: requirement.isMandatory,
          dataType: requirement.dataType,
          value: response?.value ?? null,
          numericValue: response?.numericValue ?? null,
          unit: requirement.unit ?? null,
          status: response?.status ?? "NOT_STARTED",
          isAnswered: isAnswered(response),
        };
      }),
      completeness: completenessByCategory.get(group.code) ?? null,
    });
  });

  const status: DisclosureStatus = report.isComplete
    ? "REVIEW"
    : report.answered === 0
      ? "NOT_STARTED"
      : "IN_PROGRESS";

  return {
    framework,
    name: `${definition.nameEn} — ${context.reportingYear}`,
    publisher: definition.publisher,
    version: definition.version,
    reportingYear: context.reportingYear,
    sections,
    completeness: report,
    status,
    headline: {
      scope1: context.inventory.scope1Total,
      scope2Location: context.inventory.scope2Location,
      scope2Market: context.inventory.scope2Market,
      scope3: context.inventory.scope3Total,
      total: context.inventory.totalEmissions,
      unit: context.inventory.unit,
    },
  };
}
