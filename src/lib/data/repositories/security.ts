/**
 * Security repository: users, roles, the permission matrix, ABAC policies and API
 * keys.
 *
 * Secret material never leaves this layer. `User.passwordHash`, `User.mfaSecret`,
 * `APIKey.keyHash` and `DataSource.credentials` are excluded from every select, so a
 * page or an action cannot accidentally serialise them into a payload. The API-key
 * lookup used by the route handlers is deliberately the only exception, and it takes
 * a digest and returns no secret.
 */

import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_ACCESS_POLICIES,
  DEMO_API_KEYS,
  DEMO_PERMISSIONS,
  DEMO_ROLES,
  DEMO_USERS,
  type DemoAccessPolicy,
  type DemoApiKey,
  type DemoPermission,
  type DemoRole,
  type DemoUser,
} from "../demo";

export async function listUsers(organizationId: string): Promise<readonly DemoUser[]> {
  return withDb<readonly DemoUser[]>(
    async () => {
      const rows = await prisma.user.findMany({
        where: { organizationId },
        orderBy: { email: "asc" },
        select: {
          id: true,
          organizationId: true,
          email: true,
          name: true,
          isActive: true,
          emailVerified: true,
          lastLoginAt: true,
          userRoles: { select: { roleId: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        email: row.email,
        name: row.name ?? row.email,
        isActive: row.isActive,
        emailVerified: row.emailVerified,
        lastLoginAt: row.lastLoginAt,
        roleIds: row.userRoles.map((link) => link.roleId),
      }));
    },
    () => DEMO_USERS.filter((user) => user.organizationId === organizationId),
  );
}

export async function getUserByEmail(
  email: string,
): Promise<DemoUser | null> {
  return withDb<DemoUser | null>(
    async () => {
      const row = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          organizationId: true,
          email: true,
          name: true,
          isActive: true,
          emailVerified: true,
          lastLoginAt: true,
          userRoles: { select: { roleId: true } },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        email: row.email,
        name: row.name ?? row.email,
        isActive: row.isActive,
        emailVerified: row.emailVerified,
        lastLoginAt: row.lastLoginAt,
        roleIds: row.userRoles.map((link) => link.roleId),
      };
    },
    () => DEMO_USERS.find((user) => user.email === email.toLowerCase()) ?? null,
  );
}

export async function listRoles(organizationId: string): Promise<readonly DemoRole[]> {
  return withDb<readonly DemoRole[]>(
    async () => {
      const rows = await prisma.role.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        include: { permissions: { select: { permissionId: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        description: row.description ?? "",
        isSystem: row.isSystem,
        permissionIds: row.permissions.map((link) => link.permissionId),
      }));
    },
    () => DEMO_ROLES.filter((role) => role.organizationId === organizationId),
  );
}

export async function listPermissions(): Promise<readonly DemoPermission[]> {
  return withDb<readonly DemoPermission[]>(
    async () => {
      const rows = await prisma.permission.findMany({
        orderBy: [{ resource: "asc" }, { action: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        resource: row.resource,
        action: row.action,
        description: row.description ?? "",
      }));
    },
    () => DEMO_PERMISSIONS,
  );
}

export async function listAccessPolicies(
  organizationId: string,
): Promise<readonly DemoAccessPolicy[]> {
  return withDb<readonly DemoAccessPolicy[]>(
    async () => {
      const rows = await prisma.accessPolicy.findMany({
        where: { organizationId, isActive: true },
        orderBy: { priority: "desc" },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        description: row.description ?? "",
        resource: row.resource,
        conditions: row.conditions as unknown as DemoAccessPolicy["conditions"],
        effect: row.effect === "deny" ? "deny" : "allow",
        priority: row.priority,
        isActive: row.isActive,
        appliesToRoleIds: [],
      }));
    },
    () => DEMO_ACCESS_POLICIES.filter((policy) => policy.organizationId === organizationId),
  );
}

/** API keys without their hashes, for the management table. */
export type ApiKeyListRow = Omit<DemoApiKey, "keyHash">;

export async function listApiKeys(
  organizationId: string,
): Promise<readonly ApiKeyListRow[]> {
  return withDb<readonly ApiKeyListRow[]>(
    async () => {
      const rows = await prisma.aPIKey.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          organizationId: true,
          userId: true,
          name: true,
          prefix: true,
          scopes: true,
          lastUsedAt: true,
          expiresAt: true,
          isActive: true,
          rateLimit: true,
        },
      });
      return rows;
    },
    () =>
      DEMO_API_KEYS.filter((key) => key.organizationId === organizationId).map((key) => ({
        id: key.id,
        organizationId: key.organizationId,
        userId: key.userId,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        isActive: key.isActive,
        rateLimit: key.rateLimit,
      })),
  );
}

export type ApiKeyPrincipal = {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly name: string;
  readonly scopes: readonly string[];
  readonly isActive: boolean;
  readonly expiresAt: Date | null;
  /** Per-key requests/minute; `null` falls back to `API_RATE_LIMIT_PER_MINUTE`. */
  readonly rateLimit: number | null;
};

/**
 * Resolves an API key by its digest, for `withApiKey`. The caller hashes the
 * presented token; the plaintext never reaches this layer, and no hash is
 * returned. Demo mode resolves nothing — an unseeded deployment must not accept
 * an API call.
 */
export async function findApiKeyByHash(
  keyHash: string,
): Promise<ApiKeyPrincipal | null> {
  return withDb<ApiKeyPrincipal | null>(
    async () => {
      const row = await prisma.aPIKey.findUnique({
        where: { keyHash },
        select: {
          id: true,
          organizationId: true,
          userId: true,
          name: true,
          scopes: true,
          isActive: true,
          expiresAt: true,
          rateLimit: true,
        },
      });
      return row;
    },
    () => null,
  );
}

/** Records a successful authentication without exposing the key. */
export async function touchApiKey(apiKeyId: string): Promise<void> {
  await withDb<void>(
    async () => {
      await prisma.aPIKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date() },
      });
    },
    () => undefined,
  );
}

export type SessionRow = {
  readonly id: string;
  readonly userId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
};

export async function listSessions(
  organizationId: string,
): Promise<readonly SessionRow[]> {
  return withDb<readonly SessionRow[]>(
    async () => {
      const rows = await prisma.session.findMany({
        where: { user: { organizationId }, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userId: true,
          ipAddress: true,
          userAgent: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      return rows;
    },
    () => [],
  );
}
