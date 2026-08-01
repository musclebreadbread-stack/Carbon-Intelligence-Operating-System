/**
 * Validation schemas for inventory period close/lock actions.
 */

import { z } from "zod";

import { descriptionSchema, yearSchema } from "./common";

export const periodCloseRequestSchema = z.object({
  reportingYear: yearSchema,
  reason: descriptionSchema.default("기간 마감 요청"),
});
export type PeriodCloseRequest = z.infer<typeof periodCloseRequestSchema>;

export const periodApprovalSchema = z.object({
  reportingYear: yearSchema,
  approved: z.boolean(),
  comment: descriptionSchema.nullish(),
});
export type PeriodApproval = z.infer<typeof periodApprovalSchema>;

export const periodUnlockSchema = z.object({
  reportingYear: yearSchema,
  reason: descriptionSchema.nullish(),
});
export type PeriodUnlock = z.infer<typeof periodUnlockSchema>;
