/**
 * Validation schemas for organisation-membership management (invite, role
 * change, revoke) — the security page's "Members" tab.
 */

import { z } from "zod";

import { emailSchema, idSchema } from "./common";

export const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

export const inviteMemberInputSchema = z.object({
  email: emailSchema,
  role: membershipRoleSchema.default("MEMBER"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;

export const updateMembershipRoleInputSchema = z.object({
  membershipId: idSchema,
  role: membershipRoleSchema,
});
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleInputSchema>;

export const revokeMembershipInputSchema = z.object({
  membershipId: idSchema,
});
export type RevokeMembershipInput = z.infer<typeof revokeMembershipInputSchema>;
