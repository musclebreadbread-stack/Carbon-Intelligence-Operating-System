/**
 * Organisation-membership repository.
 *
 * This is the source of truth for which organisations a user may *read* — see
 * `src/lib/auth/active-organization.ts`. It has no bearing on write access:
 * writes stay anchored to `User.organizationId` / `session.organizationId`
 * (`src/lib/actions/runtime.ts`), unchanged by this table. A user can be a
 * member of several organisations and read any of them through the active-
 * organisation switcher, but can only ever write to their home organisation.
 */

import type { MembershipRole, MembershipStatus } from "@/lib/core/enums";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import { DEMO_MEMBERSHIPS, DEMO_ORGANIZATION, DEMO_USERS } from "../demo";

export type OrganizationMembershipSummary = {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
};

export type MemberSummary = {
  readonly membershipId: string;
  readonly userId: string;
  readonly userName: string | null;
  readonly userEmail: string;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
  readonly invitedAt: Date | null;
  readonly invitedBy: string | null;
  readonly expiresAt: Date | null;
};

/** Every organisation a user has an ACTIVE membership in, for the active-organisation switcher. */
export async function listOrganizationMemberships(
  userId: string,
): Promise<readonly OrganizationMembershipSummary[]> {
  return withDb(
    async () => {
      const rows = await prisma.organizationMembership.findMany({
        where: { userId, status: "ACTIVE" },
        include: { organization: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        organizationId: row.organizationId,
        organizationName: row.organization.name,
        role: row.role,
        status: row.status,
      }));
    },
    () =>
      DEMO_MEMBERSHIPS.filter((row) => row.userId === userId && row.status === "ACTIVE").map(
        (row) => ({
          id: row.id,
          userId: row.userId,
          organizationId: row.organizationId,
          organizationName: DEMO_ORGANIZATION.name,
          role: row.role,
          status: row.status,
        }),
      ),
  );
}

/** Members of an organisation, for the security page's member-management tab. */
export async function listMembersOfOrganization(
  organizationId: string,
): Promise<readonly MemberSummary[]> {
  return withDb(
    async () => {
      const rows = await prisma.organizationMembership.findMany({
        where: { organizationId },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        membershipId: row.id,
        userId: row.userId,
        userName: row.user.name,
        userEmail: row.user.email,
        role: row.role,
        status: row.status,
        invitedAt: row.invitedAt,
        invitedBy: row.invitedBy,
        expiresAt: row.expiresAt,
      }));
    },
    () =>
      DEMO_MEMBERSHIPS.filter((row) => row.organizationId === organizationId).map((row) => {
        const user = DEMO_USERS.find((candidate) => candidate.id === row.userId);
        return {
          membershipId: row.id,
          userId: row.userId,
          userName: user?.name ?? null,
          userEmail: user?.email ?? "",
          role: row.role,
          status: row.status,
          invitedAt: row.invitedAt,
          invitedBy: row.invitedBy,
          expiresAt: row.expiresAt,
        };
      }),
  );
}

/** A single active membership, or `null` if the user does not belong to the organisation. */
export async function getMembership(
  userId: string,
  organizationId: string,
): Promise<OrganizationMembershipSummary | null> {
  const memberships = await listOrganizationMemberships(userId);
  return memberships.find((row) => row.organizationId === organizationId) ?? null;
}
