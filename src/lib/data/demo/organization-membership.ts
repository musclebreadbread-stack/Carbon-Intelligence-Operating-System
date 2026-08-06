/**
 * Demo tenant: organisation memberships.
 *
 * The demo dataset has exactly one organisation, so every demo user gets a
 * single ACTIVE membership in it — the admin as OWNER, everyone else as MEMBER.
 * This keeps `listOrganizationMemberships`/`listMembersOfOrganization` returning
 * real, derived data in demo mode rather than an empty or invented list.
 */

import { DEMO_ORGANIZATION_ID } from "./organization";
import { DEMO_ADMIN_USER_ID, DEMO_USERS } from "./security";

export type DemoOrganizationMembership = {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  readonly status: "ACTIVE" | "INVITED" | "SUSPENDED" | "REVOKED";
  readonly invitedAt: Date | null;
  readonly invitedBy: string | null;
  readonly acceptedAt: Date | null;
  readonly expiresAt: Date | null;
};

export const DEMO_MEMBERSHIPS: readonly DemoOrganizationMembership[] = DEMO_USERS.map(
  (user) => ({
    id: `demo-membership-${user.id}`,
    userId: user.id,
    organizationId: DEMO_ORGANIZATION_ID,
    role: user.id === DEMO_ADMIN_USER_ID ? "OWNER" : "MEMBER",
    status: "ACTIVE",
    invitedAt: null,
    invitedBy: null,
    acceptedAt: user.lastLoginAt,
    expiresAt: null,
  }),
);
