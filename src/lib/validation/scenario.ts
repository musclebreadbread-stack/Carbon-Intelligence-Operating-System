/**
 * Validation schemas for scenarios, assumption levers, carbon budgets, MACC
 * curves, investment appraisal and the decarbonisation roadmap.
 *
 * `ScenarioAssumption.parameter` is a free-text column in the schema, but the
 * projector only understands the levers in `SCENARIO_LEVERS`; anything else would
 * be silently ignored, so it is rejected here instead.
 */

import { z } from "zod";

import { SCENARIO_COMPARISON_METRICS, SCENARIO_LEVERS } from "@/lib/domain/scenarios/project";

import {
  descriptionSchema,
  fractionSchema,
  idSchema,
  nameSchema,
  nonNegativeNumber,
  percentSchema,
  positiveNumber,
  scenarioTypeSchema,
  yearSchema,
} from "./common";

export const scenarioLeverSchema = z.enum(SCENARIO_LEVERS);
export const scenarioComparisonMetricSchema = z.enum(SCENARIO_COMPARISON_METRICS);

export const scenarioAssumptionInputSchema = z.object({
  parameter: scenarioLeverSchema,
  value: z.number().finite(),
  unit: z.string().trim().max(30).nullish(),
  category: z.string().trim().max(60).nullish(),
  description: descriptionSchema.nullish(),
  source: z.string().trim().max(200).nullish(),
  /** Analyst confidence in the lever value, 0..1. */
  confidence: fractionSchema.nullish(),
});
export type ScenarioAssumptionInput = z.infer<typeof scenarioAssumptionInputSchema>;

export const scenarioBaselineSchema = z.object({
  year: yearSchema,
  scope1Emissions: nonNegativeNumber,
  scope2Emissions: nonNegativeNumber,
  scope3Emissions: nonNegativeNumber,
  energyConsumption: nonNegativeNumber.optional(),
  renewableShare: fractionSchema.optional(),
});
export type ScenarioBaselineInput = z.infer<typeof scenarioBaselineSchema>;

export const scenarioInputSchema = z
  .object({
    organizationId: idSchema,
    name: nameSchema,
    description: descriptionSchema.nullish(),
    type: scenarioTypeSchema.default("CUSTOM"),
    baselineYear: yearSchema,
    targetYear: yearSchema,
    status: z.enum(["draft", "active", "archived"]).default("draft"),
    isPublished: z.boolean().default(false),
    assumptions: z.array(scenarioAssumptionInputSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.targetYear <= value.baselineYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetYear"],
        message: "targetYear must be after baselineYear",
      });
    }
    const seen = new Set<string>();
    value.assumptions.forEach((assumption, index) => {
      if (seen.has(assumption.parameter)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assumptions", index, "parameter"],
          message: `Lever "${assumption.parameter}" is declared more than once`,
        });
      }
      seen.add(assumption.parameter);
    });
  });
export type ScenarioInput = z.infer<typeof scenarioInputSchema>;

/** Payload for `simulateScenarioAction`. */
export const simulateScenarioInputSchema = z
  .object({
    organizationId: idSchema,
    scenarioId: idSchema.optional(),
    name: nameSchema,
    type: scenarioTypeSchema,
    targetYear: yearSchema,
    baseline: scenarioBaselineSchema,
    assumptions: z.array(scenarioAssumptionInputSchema).default([]),
    persist: z.boolean().default(true),
  })
  .refine((value) => value.targetYear > value.baseline.year, {
    message: "targetYear must be after the baseline year",
    path: ["targetYear"],
  });
export type SimulateScenarioInput = z.infer<typeof simulateScenarioInputSchema>;

export const compareScenariosInputSchema = z
  .object({
    scenarioAId: idSchema,
    scenarioBId: idSchema,
    metrics: z.array(scenarioComparisonMetricSchema).default([]),
  })
  .refine((value) => value.scenarioAId !== value.scenarioBId, {
    message: "Choose two different scenarios",
    path: ["scenarioBId"],
  });
export type CompareScenariosInput = z.infer<typeof compareScenariosInputSchema>;

export const carbonBudgetInputSchema = z
  .object({
    organizationId: idSchema,
    name: nameSchema,
    totalBudget: positiveNumber,
    usedBudget: nonNegativeNumber.default(0),
    unit: z.string().trim().min(1).max(20).default("tCO2e"),
    startYear: yearSchema,
    endYear: yearSchema,
    /** Warming alignment in °C. */
    temperature: z.number().min(1).max(4).default(1.5),
    methodology: z.string().trim().max(200).nullish(),
    status: z.enum(["active", "exhausted", "archived"]).default("active"),
  })
  .superRefine((value, ctx) => {
    if (value.endYear < value.startYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endYear"],
        message: "endYear must be on or after startYear",
      });
    }
    if (value.usedBudget > value.totalBudget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["usedBudget"],
        message: "usedBudget cannot exceed totalBudget",
      });
    }
  });
export type CarbonBudgetInput = z.infer<typeof carbonBudgetInputSchema>;

// ---------------------------------------------------------------------------
// Roadmap and finance
// ---------------------------------------------------------------------------

export const abatementTechnologyInputSchema = z.object({
  name: nameSchema,
  category: z.string().trim().max(120).nullish(),
  description: descriptionSchema.nullish(),
  /** Abatement potential in tCO2e per year. */
  abatementPotential: nonNegativeNumber,
  /** Marginal abatement cost in currency per tCO2e; negative means net saving. */
  costPerTonne: z.number().finite(),
  capex: nonNegativeNumber.nullish(),
  opex: z.number().finite().nullish(),
  lifetime: z.number().int().min(1).max(60).nullish(),
  maturityLevel: z.string().trim().max(60).nullish(),
  applicableScope: z.string().trim().max(30).nullish(),
});
export type AbatementTechnologyInput = z.infer<typeof abatementTechnologyInputSchema>;

export const roadmapActionInputSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema.nullish(),
    category: z.string().trim().max(120).nullish(),
    expectedReduction: nonNegativeNumber,
    estimatedCost: nonNegativeNumber.nullish(),
    startYear: yearSchema,
    endYear: yearSchema,
    priority: z.number().int().min(0).max(1000).default(0),
    status: z.enum(["planned", "in_progress", "completed", "cancelled"]).default("planned"),
    technologyId: idSchema.nullish(),
  })
  .refine((value) => value.endYear >= value.startYear, {
    message: "endYear must be on or after startYear",
    path: ["endYear"],
  });
export type RoadmapActionInput = z.infer<typeof roadmapActionInputSchema>;

export const roadmapInputSchema = z
  .object({
    organizationId: idSchema,
    name: nameSchema,
    description: descriptionSchema.nullish(),
    baselineYear: yearSchema,
    targetYear: yearSchema,
    baselineEmissions: nonNegativeNumber,
    targetEmissions: nonNegativeNumber,
    status: z.enum(["draft", "approved", "active", "archived"]).default("draft"),
    actions: z.array(roadmapActionInputSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.targetYear <= value.baselineYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetYear"],
        message: "targetYear must be after baselineYear",
      });
    }
    if (value.targetEmissions > value.baselineEmissions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetEmissions"],
        message: "targetEmissions must not exceed baselineEmissions",
      });
    }
  });
export type RoadmapInput = z.infer<typeof roadmapInputSchema>;

export const investmentAnalysisInputSchema = z.object({
  name: nameSchema,
  /** Cashflow series starting at t=0; the first element is normally negative. */
  cashflows: z.array(z.number().finite()).min(2, "Supply at least two periods"),
  discountRate: z.number().min(0).max(1),
  abatement: nonNegativeNumber.default(0),
  lifetime: z.number().int().min(1).max(60).default(10),
  currency: z.string().trim().length(3).default("USD"),
});
export type InvestmentAnalysisInput = z.infer<typeof investmentAnalysisInputSchema>;

export const maccPortfolioInputSchema = z.object({
  year: yearSchema,
  abatementTarget: nonNegativeNumber.optional(),
  budget: nonNegativeNumber.optional(),
  technologyIds: z.array(idSchema).default([]),
});
export type MaccPortfolioInput = z.infer<typeof maccPortfolioInputSchema>;

/** Intensity denominators the analytics page offers. */
export const intensityDenominatorSchema = z.object({
  metric: z.enum(["revenue", "production", "area", "fte"]),
  value: positiveNumber,
  unit: z.string().trim().min(1).max(30),
});
export type IntensityDenominatorInput = z.infer<typeof intensityDenominatorSchema>;

/** Reduction percentage a UI slider may submit. */
export const reductionPercentSchema = percentSchema;
