"use server";

/**
 * Organisation-membership actions: invite, role change, revoke.
 *
 * Membership only grants *read* access to another organisation through the
 * active-organisation switcher (`src/lib/auth/active-organization.ts`) — it
 * never changes which organisation a write is attributed to. `organizationIdOf`
 * in `runtime.ts` still anchors every mutation on the session's home
 * organisation, unchanged by this file.
 *
 * There is no separate accept-invite flow in this codebase (no outbound
 * confirmation link/portal), so `inviteMemberAction` is an admin-driven "add
 * member" action: the membership is created ACTIVE immediately, on the
 * inviting admin's authority, with `invitedAt`/`invitedBy` kept for the audit
 * trail and `acceptedAt` stamped at the same instant. SSO/SAML/OIDC and MFA are
 * out of scope — they need a real identity provider and are deferred to Phase B.
 */

import { NotFoundError } from "@/lib/core/errors";
import { getUserByEmail } from "@/lib/data/repositories/security";
import { getNotificationChannel } from "@/lib/notifications/factory";
import { prisma } from "@/lib/prisma";
import {
  inviteMemberInputSchema,
  revokeMembershipInputSchema,
  updateMembershipRoleInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/security"] as const;

export type MembershipActionResult = { readonly membershipId: string };

/** Adds an existing user (looked up by email) to the caller's organization. */
export async function inviteMemberAction(
  rawInput: unknown,
): Promise<ActionState<MembershipActionResult>> {
  return runAction(
    {
      name: "inviteMember",
      resource: "organization_membership",
      action: "create",
      schema: inviteMemberInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const user = await getUserByEmail(input.email);
        if (!user) {
          throw new NotFoundError(
            `No account exists for ${input.email} yet — they must sign up before they can be added to an organization`,
            { email: input.email },
          );
        }

        const now = new Date();
        const membership = await prisma.organizationMembership.upsert({
          where: { userId_organizationId: { userId: user.id, organizationId } },
          create: {
            userId: user.id,
            organizationId,
            role: input.role,
            status: "ACTIVE",
            invitedAt: now,
            invitedBy: session.userId,
            acceptedAt: now,
          },
          update: {
            role: input.role,
            status: "ACTIVE",
          },
          select: { id: true },
        });

        await getNotificationChannel().send({
          recipient: user.email,
          subject: "You now have access to an organization on CIOS",
          body: `${session.name} (${session.email}) added you to ${session.organizationName} as ${input.role}.`,
          severity: "info",
          metadata: { organizationId, role: input.role },
        });

        return {
          data: { membershipId: membership.id },
          message: `Added ${user.email} to the organization.`,
          messageKey: "action.success.inviteMember",
          audit: [
            auditEntry(session, {
              entityType: "OrganizationMembership",
              entityId: membership.id,
              action: "create",
              after: { userId: user.id, role: input.role, status: "ACTIVE" },
              reason: `Added ${user.email} to the organization as ${input.role}`,
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Changes an existing member's role. */
export async function updateMembershipRoleAction(
  rawInput: unknown,
): Promise<ActionState<MembershipActionResult>> {
  return runAction(
    {
      name: "updateMembershipRole",
      resource: "organization_membership",
      action: "update",
      schema: updateMembershipRoleInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const membership = await prisma.organizationMembership.findUnique({
          where: { id: input.membershipId },
          select: { id: true, organizationId: true, role: true },
        });
        if (!membership || membership.organizationId !== organizationId) {
          throw new NotFoundError(`Membership ${input.membershipId} was not found`);
        }

        await prisma.organizationMembership.update({
          where: { id: membership.id },
          data: { role: input.role },
        });

        return {
          data: { membershipId: membership.id },
          message: `Role updated to ${input.role}.`,
          messageKey: "action.success.updateMembershipRole",
          audit: [
            auditEntry(session, {
              entityType: "OrganizationMembership",
              entityId: membership.id,
              action: "update",
              before: { role: membership.role },
              after: { role: input.role },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Revokes a member's access to the organization. */
export async function revokeMembershipAction(
  rawInput: unknown,
): Promise<ActionState<MembershipActionResult>> {
  return runAction(
    {
      name: "revokeMembership",
      resource: "organization_membership",
      action: "delete",
      schema: revokeMembershipInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const membership = await prisma.organizationMembership.findUnique({
          where: { id: input.membershipId },
          select: { id: true, organizationId: true, userId: true, status: true },
        });
        if (!membership || membership.organizationId !== organizationId) {
          throw new NotFoundError(`Membership ${input.membershipId} was not found`);
        }

        await prisma.organizationMembership.update({
          where: { id: membership.id },
          data: { status: "REVOKED" },
        });

        return {
          data: { membershipId: membership.id },
          message: "Access revoked.",
          messageKey: "action.success.revokeMembership",
          audit: [
            auditEntry(session, {
              entityType: "OrganizationMembership",
              entityId: membership.id,
              action: "delete",
              before: { status: membership.status },
              after: { status: "REVOKED" },
              reason: "Membership revoked",
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
