/**
 * Validation schemas for carbon finance — credits, retirement, price signals and
 * the ETS / REC / PPA coverage inputs.
 *
 * The GHG-Protocol-relevant rule enforced here is that a retirement always names
 * its purpose and reporting year, so a retired credit can never be silently
 * double-counted across two reporting periods.
 */

import { z } from "zod";

import { DEFAULT_CREDIT_UNIT } from "@/lib/domain/credits/registry";

import {
  codeSchema,
  countrySchema,
  creditStatusSchema,
  currencySchema,
  dateSchema,
  descriptionSchema,
  idSchema,
  nameSchema,
  nonNegativeNumber,
  positiveNumber,
  registryUnitSchema,
  yearSchema,
} from "./common";

/** `CarbonCredit`. */
export const carbonCreditInputSchema = z
  .object({
    organizationId: idSchema,
    serialNumber: z.string().trim().max(120).nullish(),
    registry: z.string().trim().max(80).nullish(),
    projectName: nameSchema.nullish(),
    projectType: z.string().trim().max(80).nullish(),
    vintage: yearSchema.nullish(),
    quantity: positiveNumber,
    unit: z.string().trim().max(20).default(DEFAULT_CREDIT_UNIT),
    status: creditStatusSchema.default("ACTIVE"),
    verificationStandard: z.string().trim().max(80).nullish(),
    country: countrySchema.nullish(),
    methodology: z.string().trim().max(120).nullish(),
    issuedAt: dateSchema.nullish(),
    retiredAt: dateSchema.nullish(),
    expiresAt: dateSchema.nullish(),
    price: nonNegativeNumber.nullish(),
    currency: currencySchema.nullish(),
  })
  .superRefine((value, ctx) => {
    if (
      value.issuedAt != null &&
      value.expiresAt != null &&
      value.expiresAt.getTime() <= value.issuedAt.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "expiresAt must be after issuedAt",
      });
    }
    if (value.status === "RETIRED" && value.retiredAt == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["retiredAt"],
        message: "A RETIRED credit must carry a retiredAt date",
      });
    }
  });
export type CarbonCreditInput = z.infer<typeof carbonCreditInputSchema>;

/** Request accepted by `retireCreditsAction`. */
export const retireCreditsInputSchema = z
  .object({
    organizationId: idSchema,
    quantity: positiveNumber,
    /** Retire from one vintage only. */
    vintage: yearSchema.nullish(),
    /** Retire only vintages at or after this year. */
    minVintage: yearSchema.nullish(),
    registry: z.string().trim().max(80).nullish(),
    /** Required: an untagged retirement cannot be attributed to a claim. */
    purpose: z.string().trim().min(1).max(200),
    reportingYear: yearSchema,
    offsetDate: dateSchema.optional(),
    notes: descriptionSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.vintage != null && value.minVintage != null && value.minVintage > value.vintage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minVintage"],
        message: "minVintage cannot exceed the requested vintage",
      });
    }
  });
export type RetireCreditsInput = z.infer<typeof retireCreditsInputSchema>;

/** `CarbonOffset` — the persisted retirement record. */
export const carbonOffsetInputSchema = z.object({
  creditId: idSchema,
  quantity: positiveNumber,
  unit: z.string().trim().max(20).default(DEFAULT_CREDIT_UNIT),
  offsetDate: dateSchema,
  purpose: z.string().trim().max(200).nullish(),
  reportingYear: yearSchema.nullish(),
  notes: descriptionSchema.nullish(),
});
export type CarbonOffsetInput = z.infer<typeof carbonOffsetInputSchema>;

/** `CarbonPrice` — a market price observation. */
export const carbonPriceInputSchema = z.object({
  market: z.string().trim().min(1).max(80),
  region: z.string().trim().max(120).nullish(),
  price: nonNegativeNumber,
  currency: currencySchema.default("USD"),
  unit: z.string().trim().max(20).default("per tCO2e"),
  priceDate: dateSchema,
  source: z.string().trim().max(200).nullish(),
});
export type CarbonPriceInput = z.infer<typeof carbonPriceInputSchema>;

/** `InternalCarbonPrice`. */
export const internalCarbonPriceInputSchema = z
  .object({
    organizationId: idSchema,
    price: nonNegativeNumber,
    currency: currencySchema.default("USD"),
    unit: z.string().trim().max(20).default("per tCO2e"),
    purpose: z.string().trim().max(200).nullish(),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.nullish(),
    methodology: descriptionSchema.nullish(),
    approvedBy: z.string().trim().max(200).nullish(),
  })
  .refine(
    (value) =>
      value.effectiveTo == null ||
      value.effectiveTo.getTime() > value.effectiveFrom.getTime(),
    { message: "effectiveTo must be after effectiveFrom", path: ["effectiveTo"] },
  );
export type InternalCarbonPriceInput = z.infer<typeof internalCarbonPriceInputSchema>;

/** Input to `etsPosition`. `purchased`/`sold` are optional adjustments. */
export const etsPositionInputSchema = z.object({
  scheme: codeSchema.default("EU-ETS"),
  reportingYear: yearSchema,
  allocated: nonNegativeNumber,
  verified: nonNegativeNumber,
  surrendered: nonNegativeNumber,
  purchased: nonNegativeNumber.optional(),
  sold: nonNegativeNumber.optional(),
  price: nonNegativeNumber.optional(),
  currency: currencySchema.default("EUR"),
});
export type EtsPositionInput = z.infer<typeof etsPositionInputSchema>;

/** `PowerPurchaseAgreement`. */
export const ppaInputSchema = z
  .object({
    organizationId: idSchema,
    name: nameSchema,
    counterparty: z.string().trim().max(200).nullish(),
    technology: z.string().trim().max(80).nullish(),
    type: z.enum(["PHYSICAL", "VIRTUAL", "SLEEVED", "ONSITE"]).default("PHYSICAL"),
    capacityMw: nonNegativeNumber.nullish(),
    annualVolume: nonNegativeNumber,
    volumeUnit: registryUnitSchema.default("MWh"),
    startDate: dateSchema,
    endDate: dateSchema.nullish(),
    country: countrySchema.nullish(),
    price: nonNegativeNumber.nullish(),
    currency: currencySchema.nullish(),
  })
  .refine(
    (value) => value.endDate == null || value.endDate.getTime() > value.startDate.getTime(),
    { message: "endDate must be after startDate", path: ["endDate"] },
  );
export type PpaInput = z.infer<typeof ppaInputSchema>;

/** `RenewableEnergyCertificate`. */
export const recInputSchema = z.object({
  organizationId: idSchema,
  certificateId: z.string().trim().max(120).nullish(),
  standard: z.string().trim().max(80).nullish(),
  technology: z.string().trim().max(80).nullish(),
  quantity: positiveNumber,
  unit: registryUnitSchema.default("MWh"),
  vintage: yearSchema.nullish(),
  country: countrySchema.nullish(),
  retiredAt: dateSchema.nullish(),
});
export type RecInput = z.infer<typeof recInputSchema>;

export const creditQuerySchema = z.object({
  organizationId: idSchema,
  status: creditStatusSchema.optional(),
  vintage: z.coerce.number().int().min(1900).max(2100).optional(),
  registry: z.string().trim().max(80).optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(3650).optional(),
});
export type CreditQuery = z.infer<typeof creditQuerySchema>;
