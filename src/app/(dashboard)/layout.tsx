/**
 * Dashboard shell.
 *
 * A **server** component (item 33): it resolves the session, the organisation list
 * and the deployment's configuration status once per request and hands them to the
 * client `Sidebar`/`Header` through `SessionProvider`. Doing it here means no page
 * and no client component has to fetch the session, and the demo-mode banner is
 * decided by the same `getDataMode()` the repositories set.
 */

import { connection } from "next/server";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { DemoModeBanner } from "@/components/layout/demo-mode-banner";
import {
  SessionProvider,
  type ClientSession,
} from "@/components/providers/session-provider";
import { signOutAction } from "@/lib/actions/auth";
import { resolveActiveOrganization } from "@/lib/auth/active-organization";
import { getSession, isSupabaseConfigured } from "@/lib/auth/session";
import { describeLlmMode, isLlmConfigured } from "@/lib/ai/llm/factory";
import { getDataMode, getFallbackReason, isDbConfigured } from "@/lib/data/db";
import { countUnreadNotifications } from "@/lib/data/repositories/notifications";
import {
  listFindings,
  listVerificationEngagements,
} from "@/lib/data/repositories/verification";

/**
 * Open findings still contribute to the header badge, but they are no longer the whole
 * of it: unread `Notification` rows now count too, so a rule's `notify` effect is
 * visible without opening the verification module.
 */
async function countOpenFindings(organizationId: string): Promise<number> {
  const engagements = await listVerificationEngagements(organizationId);
  const perEngagement = await Promise.all(
    engagements.map(async (engagement) => {
      const findings = await listFindings(engagement.id);
      return findings.filter(
        (finding) => finding.status !== "resolved" && finding.status !== "closed",
      ).length;
    }),
  );
  return perEngagement.reduce((total, count) => total + count, 0);
}

export default async function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  await connection();

  const [session, organization] = await Promise.all([
    getSession(),
    resolveActiveOrganization(),
  ]);
  const [openFindings, unreadNotifications] = await Promise.all([
    countOpenFindings(organization.id),
    countUnreadNotifications(organization.id),
  ]);

  const clientSession: ClientSession | null = session
    ? {
        userId: session.userId,
        email: session.email,
        name: session.name,
        // The switcher's notion of "active" is the resolved organisation, not the
        // one the identity provider happens to have on the user row.
        organizationId: organization.id,
        organizationName: organization.name,
        roles: session.roles.map((role) => role.name),
        permissions: session.roles.flatMap((role) =>
          role.permissions.map((permission) => ({
            resource: permission.resource,
            action: permission.action,
          })),
        ),
        source: session.source,
      }
    : null;

  const llm = describeLlmMode();
  const dataMode = getDataMode();

  return (
    <SessionProvider
      value={{
        session: clientSession,
        organizations: organization.available,
        dataMode,
      }}
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            signOut={signOutAction}
            llmLabel={llm.label}
            llmConfigured={isLlmConfigured()}
            openFindings={openFindings}
            unreadNotifications={unreadNotifications}
          />
          <main className="flex-1 space-y-4 overflow-y-auto bg-muted/30 p-6">
            <DemoModeBanner
              demoMode={dataMode === "demo"}
              databaseConfigured={isDbConfigured()}
              supabaseConfigured={isSupabaseConfigured()}
              llmConfigured={isLlmConfigured()}
              reason={getFallbackReason()}
            />
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
