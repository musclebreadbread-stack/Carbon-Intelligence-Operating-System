/**
 * Validation schemas for ESG disclosure.
 *
 * The framework/requirement catalogue itself is a constant (item 21), so the
 * schemas here validate the *tenant* side of disclosure: reports, responses and
 * report generation requests. Requirement codes are checked against the
 * catalogue so a response can never be filed against a code that does not exist.
 */

import { z } from "zod";

import {
  DISCLOSURE_DATA_TYPES,
  findRequirement,
  requirementsFor,
} from "@/lib/domain/disclosure/requirements";

import {
  dateSchema,
  descriptionSchema,
  disclosureStatusSchema,
  finiteNumber,
  fractionSchema,
  idSchema,
  nameSchema,
  nonNegativeNumber,
  reportingFrameworkSchema,
  urlSchema,
  yearSchema,
} from "./common";

export const disclosureDataTypeSchema = z.enum(DISCLOSURE_DATA_TYPES);

/** `DisclosureFramework` — seeded from the item-21 catalogue. */
export const disclosureFrameworkInputSchema = z.object({
  name: nameSchema,
  code: reportingFrameworkSchema,
  version: z.string().trim().max(40).nullish(),
  description: descriptionSchema.nullish(),
  publisher: z.string().trim().max(200).nullish(),
  url: urlSchema.nullish(),
  isActive: z.boolean().default(true),
});
export type DisclosureFrameworkInput = z.infer<typeof disclosureFrameworkInputSchema>;

/** `DisclosureRequirement`. */
export const disclosureRequirementInputSchema = z.object({
  frameworkId: idSchema,
  code: z.string().trim().min(1).max(60),
  name: nameSchema,
  description: descriptionSchema.nullish(),
  category: z.string().trim().max(120).nullish(),
  isMandatory: z.boolean().default(false),
  dataType: disclosureDataTypeSchema.nullish(),
  guidance: descriptionSchema.nullish(),
});
export type DisclosureRequirementInput = z.infer<typeof disclosureRequirementInputSchema>;

/** `DisclosureReport`. */
export const disclosureReportInputSchema = z.object({
  organizationId: idSchema,
  name: nameSchema,
  framework: reportingFrameworkSchema,
  reportingYear: yearSchema,
  status: disclosureStatusSchema.default("NOT_STARTED"),
  dueDate: dateSchema.nullish(),
  notes: descriptionSchema.nullish(),
  createdById: idSchema.nullish(),
});
export type DisclosureReportInput = z.infer<typeof disclosureReportInputSchema>;

/**
 * `DisclosureResponse`. `requirementCode` is validated against the item-21
 * catalogue for the named framework so a typo surfaces at entry time rather than
 * as an orphaned response row.
 */
export const disclosureResponseInputSchema = z
  .object({
    reportId: idSchema.nullish(),
    framework: reportingFrameworkSchema,
    requirementCode: z.string().trim().min(1).max(60),
    value: z.string().trim().max(20_000).nullish(),
    numericValue: finiteNumber.nullish(),
    status: disclosureStatusSchema.default("IN_PROGRESS"),
    notes: descriptionSchema.nullish(),
    evidenceUrl: urlSchema.nullish(),
    reviewedBy: idSchema.nullish(),
    reviewedAt: dateSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    const requirement = findRequirement(value.framework, value.requirementCode);
    if (!requirement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requirementCode"],
        message: `"${value.requirementCode}" is not a requirement of ${value.framework}`,
      });
      return;
    }
    if (requirement.dataType === "NUMERIC" && value.numericValue == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["numericValue"],
        message: `${value.requirementCode} is a NUMERIC datapoint and needs a numericValue`,
      });
    }
  });
export type DisclosureResponseInput = z.infer<typeof disclosureResponseInputSchema>;

/**
 * Request accepted by `generateDisclosureReportAction`. The framework must have
 * a non-empty requirement catalogue — TNFD is declared in the Prisma enum but
 * has no mapped requirements yet, and mapping it would throw downstream.
 */
export const generateDisclosureReportSchema = z
  .object({
    organizationId: idSchema,
    framework: reportingFrameworkSchema,
    reportingYear: yearSchema,
    inventoryId: idSchema.nullish(),
    revenue: nonNegativeNumber.nullish(),
    revenueUnit: z.string().trim().max(10).nullish(),
    energyConsumption: nonNegativeNumber.nullish(),
    renewableShare: fractionSchema.nullish(),
    internalCarbonPrice: nonNegativeNumber.nullish(),
    baseYear: yearSchema.nullish(),
    baseYearEmissions: nonNegativeNumber.nullish(),
    format: z.enum(["pdf", "xlsx", "json", "html"]).default("pdf"),
  })
  .superRefine((value, ctx) => {
    if (requirementsFor(value.framework).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["framework"],
        message: `No requirement catalogue is mapped for ${value.framework} yet`,
      });
    }
  });
export type GenerateDisclosureReportInput = z.infer<typeof generateDisclosureReportSchema>;

/** `ReportGeneration`. */
export const reportGenerationInputSchema = z.object({
  reportId: idSchema,
  status: z.enum(["pending", "running", "completed", "failed"]).default("pending"),
  format: z.enum(["pdf", "xlsx", "json", "html"]).default("pdf"),
  templateUsed: z.string().trim().max(120).nullish(),
  generatedUrl: urlSchema.nullish(),
  fileSize: z.number().int().nonnegative().nullish(),
  pageCount: z.number().int().nonnegative().nullish(),
  errorMessage: descriptionSchema.nullish(),
});
export type ReportGenerationInput = z.infer<typeof reportGenerationInputSchema>;

export const disclosureQuerySchema = z.object({
  organizationId: idSchema,
  framework: reportingFrameworkSchema.optional(),
  reportingYear: z.coerce.number().int().min(1900).max(2100).optional(),
  status: disclosureStatusSchema.optional(),
});
export type DisclosureQuery = z.infer<typeof disclosureQuerySchema>;
