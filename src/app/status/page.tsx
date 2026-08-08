/**
 * Deployment status page.
 *
 * Formerly the root `/` route — moved here when `/` became the marketing
 * landing page (see the commercialisation plan). Same content and purpose:
 * a developer/operator view of what this deployment actually has configured,
 * with the right entry point for a visitor who lands here directly.
 */

import { connection } from "next/server";
import {
  BarChart3,
  Bot,
  Brain,
  Coins,
  Database,
  FileCheck,
  FileText,
  Flame,
  Leaf,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/shared/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { describeLlmMode, isLlmConfigured } from "@/lib/ai/llm/factory";
import { getSession, isSupabaseConfigured } from "@/lib/auth/session";
import { getDataMode, isDbConfigured } from "@/lib/data/db";
import { getDictionary } from "@/lib/i18n/server";
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";

export const metadata = {
  title: "CIOS — Deployment Status",
  description: "Configuration status for this CIOS deployment.",
};

const MODULES = [
  {
    icon: Database,
    titleKey: "landing.module.inventory.title",
    bodyKey: "landing.module.inventory.body",
  },
  {
    icon: Flame,
    titleKey: "landing.module.engines.title",
    bodyKey: "landing.module.engines.body",
  },
  {
    icon: Brain,
    titleKey: "landing.module.ai.title",
    bodyKey: "landing.module.ai.body",
  },
  {
    icon: BarChart3,
    titleKey: "landing.module.targets.title",
    bodyKey: "landing.module.targets.body",
  },
  {
    icon: Coins,
    titleKey: "landing.module.finance.title",
    bodyKey: "landing.module.finance.body",
  },
  {
    icon: FileText,
    titleKey: "landing.module.disclosure.title",
    bodyKey: "landing.module.disclosure.body",
  },
  {
    icon: FileCheck,
    titleKey: "landing.module.mrv.title",
    bodyKey: "landing.module.mrv.body",
  },
  {
    icon: Bot,
    titleKey: "landing.module.agents.title",
    bodyKey: "landing.module.agents.body",
  },
] as const;

export default async function StatusPage() {
  await connection();

  const dict = await getDictionary();
  const session = await getSession();
  const supabaseConfigured = isSupabaseConfigured();
  const dataMode = getDataMode();
  const llm = describeLlmMode();

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <Leaf className="size-5 text-emerald-600" />
          <span className="text-sm font-semibold">CIOS</span>
          <Badge variant="outline" className="ml-1">
            {dataMode === "demo" ? dict["demo.banner"] : dict["dashboard.badge.live"]}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {session ? (
            <LinkButton size="sm" href="/dashboard">
              {dict["landing.openDashboard"]}
            </LinkButton>
          ) : supabaseConfigured ? (
            <>
              <LinkButton size="sm" variant="ghost" href="/register">
                {dict["auth.createAccount"]}
              </LinkButton>
              <LinkButton size="sm" href="/login">
                {dict["auth.login"]}
              </LinkButton>
            </>
          ) : (
            <LinkButton size="sm" href="/dashboard">
              {dict["landing.exploreDemo"]}
            </LinkButton>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-6 py-12">
        <section className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {dict["landing.title"]}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            {dict["landing.heroBody"]}
          </p>
          <div className="flex flex-wrap gap-2">
            {session ? (
              <LinkButton href="/dashboard">{dict["landing.openDashboard"]}</LinkButton>
            ) : (
              <LinkButton href="/dashboard">
                {supabaseConfigured ? dict["landing.openDashboard"] : dict["landing.exploreSampleData"]}
              </LinkButton>
            )}
            <LinkButton variant="outline" href="/emission-engine">
              {dict["landing.seeEngine"]}
            </LinkButton>
            <LinkButton variant="ghost" href="/api-gateway">
              {dict["landing.restApi"]}
            </LinkButton>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-muted-foreground" />
              {dict["landing.deployment.title"]}
            </CardTitle>
            <CardDescription>
              {dict["landing.deployment.description"]}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{dict["apiGateway.label.database"]}</p>
                <Badge variant={isDbConfigured() ? "secondary" : "outline"}>
                  {isDbConfigured() ? dict["apiGateway.label.configured"] : dict["apiGateway.label.notConfigured"]}
                </Badge>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isDbConfigured()
                    ? dict["landing.deployment.dbConfiguredDesc"]
                    : dict["landing.deployment.dbNotConfiguredDesc"]}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{dict["landing.deployment.authLabel"]}</p>
                <Badge variant={supabaseConfigured ? "secondary" : "outline"}>
                  {supabaseConfigured ? dict["apiGateway.label.supabase"] : dict["landing.deployment.demoSessionBadge"]}
                </Badge>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {supabaseConfigured
                    ? dict["landing.deployment.authConfiguredDesc"]
                    : "Supabase가 구성되지 않아 데모 관리자 세션으로 동작합니다."}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{dict["landing.deployment.narrativeLabel"]}</p>
                <Badge variant={isLlmConfigured() ? "secondary" : "outline"}>
                  {llm.mode}
                </Badge>
                <p className="mt-1 text-[11px] text-muted-foreground">{llm.label}</p>
              </div>
            </div>
            {dataMode === "demo" && (
              <p className="text-xs text-muted-foreground">
                직접 설정해야 하는 항목(데이터베이스, Supabase, OpenAI, Mapbox 등)은{" "}
                <code>{SETUP_GUIDE_PATH}</code> 문서에 단계별로 정리되어 있습니다.
              </p>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2">
          {MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.titleKey}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Icon className="size-4 text-emerald-600" />
                    {dict[module.titleKey]}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{dict[module.bodyKey]}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>

      <footer className="border-t bg-background px-6 py-4 text-center text-xs text-muted-foreground">
        {dict["landing.footer"]}
      </footer>
    </div>
  );
}
