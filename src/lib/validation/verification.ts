/**
 * Validation schemas for third-party verification, MRV and the audit trail.
 *
 * Severity and finding status are free-text columns in Prisma; the schemas pin
 * them to the vocabularies the item-22 engines actually understand, so a finding
 * can never be filed with a severity the rollup would silently drop.
 */

import { z } from "zod";

import {
  ASSURANCE_LEVELS,
  OPINION_TYPES,
} from "@/lib/domain/verification/materiality";
import {
  CLOSED_FINDING_STATUSES,
  FINDING_SEVERITIES,
  OPEN_FINDING_STATUSES,
} from "@/lib/domain/verification/findings";

import {
  dateSchema,
  descriptionSchema,
  fractionSchema,
  idSchema,
  measurementFrequencySchema,
  nameSchema,
  nonNegativeNumber,
  percentSchema,
  registryUnitSchema,
  reportingFrameworkSchema,
  urlSchema,
  verificationStatusSchema,
} from "./common";

export const assuranceLevelSchema = z.enum(ASSURANCE_LEVELS);
export const opinionTypeSchema = z.enum(OPINION_TYPES);
export const findingSeveritySchema = z.enum(FINDING_SEVERITIES);

const FINDING_STATUSES = [...OPEN_FINDING_STATUSES, ...CLOSED_FINDING_STATUSES] as const;
export const findingStatusSchema = z.enum(FINDING_STATUSES);

export const findingTypeSchema = z.enum([
  "MISSTATEMENT",
  "NONCONFORMITY",
  "CONTROL_WEAKNESS",
  "DOCUMENTATION",
  "OBSERVATION",
]);

/** `VerificationEngagement`. */
export const verificationEngagementInputSchema = z
  .object({
    organizationId: idSchema,
    name: nameSchema,
    verifierName: z.string().trim().max(200).nullish(),
    verifierOrg: z.string().trim().max(200).nullish(),
    framework: reportingFrameworkSchema.nullish(),
    scope: z.string().trim().max(300).nullish(),
    level: assuranceLevelSchema.nullish(),
    status: verificationStatusSchema.default("NOT_STARTED"),
    startDate: dateSchema.nullish(),
    endDate: dateSchema.nullish(),
    opinionType: opinionTypeSchema.nullish(),
  })
  .refine(
    (value) =>
      value.startDate == null ||
      value.endDate == null ||
      value.endDate.getTime() >= value.startDate.getTime(),
    { message: "endDate must be on or after startDate", path: ["endDate"] },
  );
export type VerificationEngagementInput = z.infer<typeof verificationEngagementInputSchema>;

/** `VerificationScope`. */
export const verificationScopeInputSchema = z.object({
  engagementId: idSchema,
  category: z.string().trim().min(1).max(120),
  description: descriptionSchema.nullish(),
  boundaries: descriptionSchema.nullish(),
  /** Materiality as a percentage of the verified total, e.g. 5 for limited assurance. */
  materialityThreshold: percentSchema.nullish(),
  status: verificationStatusSchema.default("NOT_STARTED"),
});
export type VerificationScopeInput = z.infer<typeof verificationScopeInputSchema>;

/** `VerificationFinding`. */
export const verificationFindingInputSchema = z
  .object({
    engagementId: idSchema,
    type: findingTypeSchema,
    severity: findingSeveritySchema,
    title: nameSchema,
    description: descriptionSchema.nullish(),
    recommendation: descriptionSchema.nullish(),
    response: descriptionSchema.nullish(),
    status: findingStatusSchema.default("open"),
    dueDate: dateSchema.nullish(),
    resolvedAt: dateSchema.nullish(),
    assignedToId: idSchema.nullish(),
    /** Absolute magnitude of the misstatement in tCO2e, when quantified. */
    misstatementAmount: z.number().finite().nullish(),
    /** Informational only — not fed into materiality math. */
    estimatedFinancialImpact: z.number().finite().nonnegative().nullish(),
    /** ISO 4217 currency code, required alongside `estimatedFinancialImpact`. */
    impactCurrency: z.string().trim().length(3).toUpperCase().nullish(),
  })
  .superRefine((value, ctx) => {
    const isClosed = (CLOSED_FINDING_STATUSES as readonly string[]).includes(value.status);
    if (isClosed && value.resolvedAt == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resolvedAt"],
        message: `A "${value.status}" finding must carry a resolvedAt date`,
      });
    }
    if (value.severity === "CRITICAL" && !value.recommendation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendation"],
        message: "A CRITICAL finding must carry a recommendation",
      });
    }
  });
export type VerificationFindingInput = z.infer<typeof verificationFindingInputSchema>;

/** Input to `aggregateMisstatements`. */
export const materialityAssessmentInputSchema = z.object({
  engagementId: idSchema,
  totalEmissions: nonNegativeNumber,
  assuranceLevel: assuranceLevelSchema.default("LIMITED"),
  threshold: percentSchema.optional(),
});
export type MaterialityAssessmentInput = z.infer<typeof materialityAssessmentInputSchema>;

/** `EvidencePackage`. */
export const evidencePackageInputSchema = z.object({
  engagementId: idSchema,
  name: nameSchema,
  description: descriptionSchema.nullish(),
  type: z.string().trim().max(60).nullish(),
  status: z.enum(["pending", "submitted", "accepted", "rejected"]).default("pending"),
  items: z
    .array(
      z.object({
        title: nameSchema,
        type: z.string().trim().min(1).max(60),
        fileUrl: urlSchema.nullish(),
        fileType: z.string().trim().max(40).nullish(),
        fileSize: z.number().int().nonnegative().nullish(),
        content: z.string().max(200_000).nullish(),
      }),
    )
    .min(1, "An evidence package must contain at least one item"),
});
export type EvidencePackageInput = z.infer<typeof evidencePackageInputSchema>;

/** `MRVPlan`. */
export const mrvPlanInputSchema = z
  .object({
    organizationId: idSchema,
    name: nameSchema,
    description: descriptionSchema.nullish(),
    framework: z.string().trim().max(80).nullish(),
    version: z.string().trim().max(40).nullish(),
    status: z.enum(["draft", "active", "suspended", "closed"]).default("draft"),
    startDate: dateSchema.nullish(),
    endDate: dateSchema.nullish(),
  })
  .refine(
    (value) =>
      value.startDate == null ||
      value.endDate == null ||
      value.endDate.getTime() > value.startDate.getTime(),
    { message: "endDate must be after startDate", path: ["endDate"] },
  );
export type MrvPlanInput = z.infer<typeof mrvPlanInputSchema>;

/** `MonitoringPlan`. */
export const monitoringPlanInputSchema = z.object({
  mrvPlanId: idSchema,
  name: nameSchema,
  description: descriptionSchema.nullish(),
  frequency: measurementFrequencySchema,
  startDate: dateSchema,
  endDate: dateSchema.nullish(),
  status: z.enum(["active", "paused", "completed"]).default("active"),
});
export type MonitoringPlanInput = z.infer<typeof monitoringPlanInputSchema>;

/**
 * `MonitoringParameter`. `emissionSourceId` is *not* a Prisma column — the data
 * layer resolves the association and passes it to the domain engine, so the
 * schema accepts it as an optional denormalised hint.
 */
export const monitoringParameterInputSchema = z.object({
  monitoringPlanId: idSchema,
  name: nameSchema,
  description: descriptionSchema.nullish(),
  unit: registryUnitSchema,
  frequency: measurementFrequencySchema.nullish(),
  methodology: z.string().trim().max(200).nullish(),
  threshold: z.number().finite().nullish(),
  alertOnBreach: z.boolean().default(true),
  emissionSourceId: idSchema.nullish(),
});
export type MonitoringParameterInput = z.infer<typeof monitoringParameterInputSchema>;

/** `Measurement`. */
export const measurementInputSchema = z.object({
  mrvPlanId: idSchema,
  parameter: z.string().trim().min(1).max(120),
  value: z.number().finite(),
  unit: registryUnitSchema,
  uncertainty: fractionSchema.nullish(),
  methodology: z.string().trim().max(200).nullish(),
  frequency: measurementFrequencySchema.nullish(),
  measuredAt: dateSchema,
  verifiedAt: dateSchema.nullish(),
  evidenceUrl: urlSchema.nullish(),
  notes: descriptionSchema.nullish(),
});
export type MeasurementInput = z.infer<typeof measurementInputSchema>;

/** `AuditTrail` — written by every mutation through `buildAuditEntry`. */
export const auditTrailQuerySchema = z.object({
  entityType: z.string().trim().max(80).optional(),
  entityId: idSchema.optional(),
  action: z.string().trim().max(40).optional(),
  performedBy: idSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});
export type AuditTrailQuery = z.infer<typeof auditTrailQuerySchema>;

export const verificationQuerySchema = z.object({
  organizationId: idSchema,
  status: verificationStatusSchema.optional(),
  framework: reportingFrameworkSchema.optional(),
  severity: findingSeveritySchema.optional(),
  openOnly: z.coerce.boolean().default(false),
});
export type VerificationQuery = z.infer<typeof verificationQuerySchema>;
