/**
 * Validation schemas for science-based targets, pathways and net-zero pledges.
 *
 * The SBTi structural rules that can be checked without the inventory live here
 * (target year after baseline year, reduction inside 0–100 %); the ambition and
 * coverage screens that need emissions data live in
 * `domain/targets/sbti.validateTargetAgainstCriteria`.
 */

import { z } from "zod";

import {
  dateSchema,
  descriptionSchema,
  idSchema,
  nameSchema,
  nonNegativeNumber,
  percentSchema,
  targetBoundarySchema,
  targetStatusSchema,
  yearSchema,
} from "./common";

export const targetTypeInputSchema = z.object({
  name: nameSchema,
  code: z.string().trim().min(1).max(40),
  description: descriptionSchema.nullish(),
  methodology: z.string().trim().max(120).nullish(),
  pathway: z.string().trim().max(120).nullish(),
});
export type TargetTypeInput = z.infer<typeof targetTypeInputSchema>;

export const scienceBasedTargetInputSchema = z
  .object({
    organizationId: idSchema,
    targetTypeId: idSchema.nullish(),
    name: nameSchema,
    boundary: targetBoundarySchema,
    baselineYear: yearSchema,
    baselineEmissions: nonNegativeNumber.nullish(),
    targetYear: yearSchema,
    /** Percentage reduction against the baseline. */
    targetReduction: percentSchema,
    targetAbsolute: nonNegativeNumber.nullish(),
    currentEmissions: nonNegativeNumber.nullish(),
    currentProgress: percentSchema.default(0),
    methodology: z.string().trim().max(200).nullish(),
    status: targetStatusSchema.default("DRAFT"),
    submittedAt: dateSchema.nullish(),
    approvedAt: dateSchema.nullish(),
    validatedBy: z.string().trim().max(120).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.targetYear <= value.baselineYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetYear"],
        message: "targetYear must be after baselineYear",
      });
    }
    if (value.targetReduction === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetReduction"],
        message: "targetReduction must be greater than 0",
      });
    }
  });
export type ScienceBasedTargetInput = z.infer<typeof scienceBasedTargetInputSchema>;

export const targetProgressInputSchema = z.object({
  targetId: idSchema,
  year: yearSchema,
  emissions: nonNegativeNumber,
  reductionFromBaseline: z.number().finite().nullish(),
  reductionPercent: z.number().finite().nullish(),
  isOnTrack: z.boolean().nullish(),
  notes: descriptionSchema.nullish(),
  verifiedAt: dateSchema.nullish(),
});
export type TargetProgressInput = z.infer<typeof targetProgressInputSchema>;

export const netZeroCommitmentInputSchema = z
  .object({
    targetId: idSchema,
    pledgeYear: yearSchema,
    netZeroYear: yearSchema,
    /** Interim reduction, as a percentage of the baseline. */
    interimTarget: percentSchema.nullish(),
    interimYear: yearSchema.nullish(),
    residualEmissions: nonNegativeNumber.nullish(),
    neutralizationStrategy: descriptionSchema.nullish(),
    status: targetStatusSchema.default("DRAFT"),
    declaredAt: dateSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.netZeroYear <= value.pledgeYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["netZeroYear"],
        message: "netZeroYear must be after pledgeYear",
      });
    }
    if (
      value.interimYear !== null &&
      value.interimYear !== undefined &&
      (value.interimYear <= value.pledgeYear || value.interimYear >= value.netZeroYear)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interimYear"],
        message: "interimYear must fall between pledgeYear and netZeroYear",
      });
    }
  });
export type NetZeroCommitmentInput = z.infer<typeof netZeroCommitmentInputSchema>;

export const baselineYearInputSchema = z
  .object({
    targetId: idSchema,
    year: yearSchema,
    scope1Emissions: nonNegativeNumber.nullish(),
    scope2Emissions: nonNegativeNumber.nullish(),
    scope3Emissions: nonNegativeNumber.nullish(),
    totalEmissions: nonNegativeNumber.nullish(),
    methodology: z.string().trim().max(200).nullish(),
    isRecalculated: z.boolean().default(false),
    recalculationReason: descriptionSchema.nullish(),
    verifiedAt: dateSchema.nullish(),
  })
  .refine((value) => !value.isRecalculated || Boolean(value.recalculationReason), {
    message: "A recalculated baseline must state its reason",
    path: ["recalculationReason"],
  });
export type BaselineYearInput = z.infer<typeof baselineYearInputSchema>;

export const flagTargetInputSchema = z.object({
  targetId: idSchema,
  sector: z.string().trim().min(1).max(120),
  commodity: z.string().trim().max(120).nullish(),
  baselineEmissions: nonNegativeNumber.nullish(),
  targetReduction: percentSchema.nullish(),
  landUseChange: z.number().finite().nullish(),
  methodology: z.string().trim().max(200).nullish(),
  status: targetStatusSchema.default("DRAFT"),
});
export type FlagTargetInput = z.infer<typeof flagTargetInputSchema>;

/** Payload for the pathway generator. */
export const targetPathwayRequestSchema = z
  .object({
    targetId: idSchema,
    baselineYear: yearSchema,
    baselineEmissions: nonNegativeNumber,
    targetYear: yearSchema,
    /** Annual linear reduction rate in per cent; 4.2 is the SBTi 1.5 °C rate. */
    annualRate: z.number().min(0).max(100).default(4.2),
    method: z.enum(["ABSOLUTE_CONTRACTION", "SECTORAL_DECARBONIZATION"]).default(
      "ABSOLUTE_CONTRACTION",
    ),
  })
  .refine((value) => value.targetYear > value.baselineYear, {
    message: "targetYear must be after baselineYear",
    path: ["targetYear"],
  });
export type TargetPathwayRequest = z.infer<typeof targetPathwayRequestSchema>;
