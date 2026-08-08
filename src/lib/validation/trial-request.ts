/** Validation for the public landing page's "free trial" lead form. */

import { z } from "zod";

import { descriptionSchema, emailSchema, nameSchema } from "./common";

export const trialRequestInputSchema = z.object({
  companyName: nameSchema,
  contactName: nameSchema,
  email: emailSchema,
  phone: z.string().trim().max(30).nullish(),
  facilityCount: z.coerce.number().int().min(1).max(10_000).nullish(),
  message: descriptionSchema.nullish(),
});
export type TrialRequestInput = z.infer<typeof trialRequestInputSchema>;
