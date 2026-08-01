/**
 * Security module.
 *
 * Users, roles, the permission matrix, API keys, active sessions, ABAC access
 * policies and the audit log — all read-only views over the item-28 security
 * repository. The permission matrix is rendered from the *same* `Permission` rows
 * `can()` evaluates, so it cannot claim access the authoriser would refuse.
 */

import { connection } from "next/server";
import { KeyRound, Lock, Users, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { listAuditTrail } from "@/lib/data/repositories/audit";
import {
  listAccessPolicies,
  listApiKeys,
  listPermissions,
  listRoles,
  listSessions,
  listUsers,
} from "@/lib/data/repositories/security";
import { isDbConfigured } from "@/lib/data/db";
import { formatDate, formatDateTime, formatNumber, humaniseEnum } from "@/lib/format";
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";
import { getDictionary } from "@/lib/i18n/server";

export default async function SecurityPage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();

  const [users, roles, permissions, policies, apiKeys, sessions, auditTrail] =
    await Promise.all([
      listUsers(organizationId),
      listRoles(organizationId),
      listPermissions(),
      listAccessPolicies(organizationId),
      listApiKeys(organizationId),
      listSessions(organizationId),
      listAuditTrail({}, { limit: 50 }),
    ]);

  const permissionById = new Map(permissions.map((permission) => [permission.id, permission]));
  const resources = [...new Set(permissions.map((permission) => permission.resource))]
    .filter((resource) => resource !== "*")
    .sort();
  const actions = [...new Set(permissions.map((permission) => permission.action))]
    .filter((action) => action !== "*")
    .sort();

  /** Whether a role grants `action` on `resource`, wildcards included. */
  function grants(roleId: string, resource: string, action: string): boolean {
    const role = roles.find((candidate) => candidate.id === roleId);
    if (!role) return false;
    return role.permissionIds.some((permissionId) => {
      const permission = permissionById.get(permissionId);
      if (!permission) return false;
      return (
        (permission.resource === resource || permission.resource === "*") &&
        (permission.action === action || permission.action === "*")
      );
    });
  }

  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  const userNames = new Map(users.map((user) => [user.id, user.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["security.title"]}
        description={dict["security.desc"]}
        meta={[
          { label: dict["security.meta.users"], value: formatNumber(users.length) },
          { label: dict["security.meta.roles"], value: formatNumber(roles.length) },
          { label: dict["security.meta.permissions"], value: formatNumber(permissions.length) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={dict["security.kpi.activeUsers"]}
          value={formatNumber(users.filter((user) => user.isActive).length)}
          icon={Users}
          description={`${users.filter((user) => !user.emailVerified).length} ${dict["security.kpi.activeUsersDesc"]}`}
          source="listUsers()"
        />
        <KpiCard
          title={dict["security.kpi.rolesKpi"]}
          value={formatNumber(roles.length)}
          icon={UserCheck}
          description={`${roles.filter((role) => role.isSystem).length} ${dict["security.kpi.rolesDesc"]}`}
          source="listRoles()"
        />
        <KpiCard
          title={dict["security.kpi.apiKeysKpi"]}
          value={formatNumber(apiKeys.length)}
          icon={KeyRound}
          description={`${apiKeys.filter((key) => key.isActive).length} ${dict["security.kpi.apiKeysActive"]}`}
          source="listApiKeys()"
        />
        <KpiCard
          title={dict["security.kpi.accessPolicies"]}
          value={formatNumber(policies.length)}
          icon={Lock}
          description={`${policies.filter((policy) => policy.effect === "deny").length} ${dict["security.kpi.accessPoliciesDesc"]}`}
          source="listAccessPolicies()"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{dict["security.card.permissionMatrix"]}</CardTitle>
          <CardDescription>
            {dict["security.card.permissionMatrixDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={roles[0]?.id ?? "none"}>
            <TabsList className="flex-wrap" variant="line">
              {roles.map((role) => (
                <TabsTrigger key={role.id} value={role.id}>
                  {role.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {roles.map((role) => (
              <TabsContent key={role.id} value={role.id} className="space-y-2 pt-3">
                <p className="text-xs text-muted-foreground">
                  {role.description} · {role.permissionIds.length} permission
                  {role.permissionIds.length === 1 ? "" : "s"}
                  {role.isSystem ? " · system role" : ""}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-0.5 text-xs">
                    <thead>
                      <tr>
                        <th className="px-2 py-1 text-left font-medium text-muted-foreground">
                          {dict["security.table.resource"]}
                        </th>
                        {actions.map((action) => (
                          <th
                            key={action}
                            className="px-1 py-1 text-center font-medium text-muted-foreground"
                          >
                            {action}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resources.map((resource) => (
                        <tr key={resource}>
                          <th
                            scope="row"
                            className="px-2 py-1 text-left font-normal whitespace-nowrap"
                          >
                            {resource}
                          </th>
                          {actions.map((action) => {
                            const granted = grants(role.id, resource, action);
                            return (
                              <td
                                key={action}
                                className={`rounded-sm px-1 py-1 text-center ${
                                  granted
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                    : "bg-muted text-muted-foreground"
                                }`}
                                title={`${role.name}: ${action} on ${resource} — ${granted ? "granted" : "denied"}`}
                              >
                                {granted ? "✓" : "·"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dict["security.card.usersKeysAndSessions"]}</CardTitle>
          <CardDescription>
            {dict["security.card.usersKeysAndSessionsDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="users">
            <TabsList className="flex-wrap" variant="line">
              <TabsTrigger value="users">{dict["security.tab.users"]} ({users.length})</TabsTrigger>
              <TabsTrigger value="keys">{dict["security.tab.apiKeys"]} ({apiKeys.length})</TabsTrigger>
              <TabsTrigger value="sessions">{dict["security.tab.sessions"]} ({sessions.length})</TabsTrigger>
              <TabsTrigger value="policies">{dict["security.tab.policies"]} ({policies.length})</TabsTrigger>
              <TabsTrigger value="audit">{dict["security.tab.auditLog"]}</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-1.5 pt-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
                >
                  <span className="font-medium">{user.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{user.email}</span>
                  <Badge variant={user.isActive ? "secondary" : "destructive"}>
                    {user.isActive ? "active" : "deactivated"}
                  </Badge>
                  {!user.emailVerified && <Badge variant="outline">email unverified</Badge>}
                  <div className="flex flex-wrap gap-1">
                    {user.roleIds.map((roleId) => (
                      <Badge key={roleId} variant="outline">
                        {roleNames.get(roleId) ?? roleId}
                      </Badge>
                    ))}
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground">
                    last login {formatDateTime(user.lastLoginAt)}
                  </span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="keys" className="space-y-2 pt-3">
              {apiKeys.length === 0 ? (
                <EmptyState title={dict["security.empty.noApiKeys"]} />
              ) : (
                apiKeys.map((key) => (
                  <div key={key.id} className="rounded-md border p-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{key.name}</span>
                      <Badge variant="outline" className="font-mono">
                        {key.prefix}…
                      </Badge>
                      <Badge variant={key.isActive ? "secondary" : "destructive"}>
                        {key.isActive ? "active" : "revoked"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {userNames.get(key.userId) ?? key.userId}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        last used {formatDateTime(key.lastUsedAt)} · expires{" "}
                        {formatDate(key.expiresAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <Badge key={scope} variant="outline" className="font-mono">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              )}
              <p className="text-xs text-muted-foreground">
                Creating or revoking a key writes to the `APIKey` table and returns the plaintext
                exactly once, so it needs <code>DATABASE_URL</code>
                {isDbConfigured() ? "." : ` — see ${SETUP_GUIDE_PATH}.`}
              </p>
            </TabsContent>

            <TabsContent value="sessions" className="space-y-1.5 pt-3">
              {sessions.length === 0 ? (
                <EmptyState
                  title={dict["security.empty.noSessions"]}
                  description={dict["security.empty.noSessionsDesc"]}
                />
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-xs"
                  >
                    <span className="font-medium">
                      {userNames.get(session.userId) ?? session.userId}
                    </span>
                    <span className="font-mono">{session.ipAddress ?? "no ip"}</span>
                    <span className="truncate text-muted-foreground">
                      {session.userAgent ?? "no user agent"}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      started {formatDateTime(session.createdAt)} · expires{" "}
                      {formatDateTime(session.expiresAt)}
                    </span>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="policies" className="space-y-2 pt-3">
              {policies.map((policy) => (
                <div key={policy.id} className="rounded-md border p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{policy.name}</span>
                    <Badge variant={policy.effect === "deny" ? "destructive" : "secondary"}>
                      {policy.effect}
                    </Badge>
                    <Badge variant="outline">{policy.resource}</Badge>
                    <Badge variant="outline">priority {policy.priority}</Badge>
                    {!policy.isActive && <Badge variant="outline">inactive</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{policy.description}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {policy.conditions.logicGroup}(
                    {policy.conditions.rules
                      .map((rule) => `${rule.field} ${rule.operator} ${rule.value}`)
                      .join(", ")}
                    )
                  </p>
                  {policy.appliesToRoleIds.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Applies to:{" "}
                      {policy.appliesToRoleIds
                        .map((roleId) => roleNames.get(roleId) ?? roleId)
                        .join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="audit" className="pt-3">
              {auditTrail.length === 0 ? (
                <EmptyState
                  title={dict["security.empty.noAuditEntries"]}
                  description={dict["security.empty.noAuditEntriesDesc"]}
                />
              ) : (
                <ul className="space-y-1">
                  {auditTrail.map((entry) => (
                    <li key={entry.id} className="rounded-md border p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{humaniseEnum(entry.action)}</Badge>
                        <span className="font-medium">{entry.entityType}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {entry.entityId}
                        </span>
                        <span className="text-muted-foreground">
                          {entry.performedBy
                            ? (userNames.get(entry.performedBy) ?? entry.performedBy)
                            : "system"}
                        </span>
                        <span className="ml-auto text-muted-foreground">
                          {formatDateTime(entry.timestamp)}
                        </span>
                      </div>
                      {entry.reason && <p className="mt-1">{entry.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
