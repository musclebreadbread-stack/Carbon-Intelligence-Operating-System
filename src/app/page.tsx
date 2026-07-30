/**
 * Landing page.
 *
 * Previously an unconditional `redirect("/dashboard")`, which meant a visitor with
 * no session bounced straight into the middleware's redirect back to `/login`. Now
 * it states what the system is, reports the deployment's actual configuration
 * status, and offers the right entry point: the dashboard when a session exists,
 * sign-in when Supabase is configured, and the demo dashboard when it is not.
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
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";

export const metadata = {
  title: "CIOS — Carbon Intelligence Operating System",
  description:
    "AI-native enterprise carbon management: GHG Protocol inventory, science-based targets, ESG disclosure and decarbonisation planning.",
};

const MODULES = [
  {
    icon: Database,
    title: "Inventory and master data",
    body: "Seven-level organisational hierarchy, versioned emission factors with citations, and activity data with per-entry data-quality scoring.",
  },
  {
    icon: Flame,
    title: "Calculation engines",
    body: "Scope 1 (stationary, mobile, process, fugitive), dual-basis Scope 2, all fifteen Scope 3 categories, uncertainty propagation and Monte Carlo.",
  },
  {
    icon: Brain,
    title: "Statistical AI",
    body: "Anomaly detection, forecasting, gap detection and confidence scoring as deterministic statistics — reproducible and defensible in an audit.",
  },
  {
    icon: BarChart3,
    title: "Targets and scenarios",
    body: "SBTi absolute-contraction pathways, net-zero planning, carbon budgets and scenario projection against IEA lever sets.",
  },
  {
    icon: Coins,
    title: "Carbon finance",
    body: "MACC curves, NPV/IRR appraisal, credit registry with FIFO retirement, ETS position and REC/PPA coverage.",
  },
  {
    icon: FileText,
    title: "Disclosure",
    body: "CDP, ISSB, CSRD/ESRS, TCFD, GRI and SASB mapping with numeric datapoints auto-populated from the calculated inventory.",
  },
  {
    icon: FileCheck,
    title: "MRV and verification",
    body: "Monitoring plan coverage, measurement completeness, findings with materiality-driven opinion forming and hashed evidence packages.",
  },
  {
    icon: Bot,
    title: "Agents and API",
    body: "A bounded tool-call runtime over the same domain functions, MCP server connections, and a rate-limited REST gateway.",
  },
] as const;

export default async function Home() {
  await connection();

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
            {dataMode === "demo" ? "demo mode" : "live"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {session ? (
            <LinkButton size="sm" href="/dashboard">
              Open the dashboard
            </LinkButton>
          ) : supabaseConfigured ? (
            <>
              <LinkButton size="sm" variant="ghost" href="/register">
                Create an account
              </LinkButton>
              <LinkButton size="sm" href="/login">
                Sign in
              </LinkButton>
            </>
          ) : (
            <LinkButton size="sm" href="/dashboard">
              Explore the demo
            </LinkButton>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-6 py-12">
        <section className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Carbon Intelligence Operating System
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            An enterprise greenhouse-gas platform built the other way round from most: the
            calculation engines are pure, tested TypeScript with no database or framework
            imports, and the interface reads through them. Every figure on every screen names
            the function that produced it, because an inventory number you cannot re-perform is
            not an inventory number.
          </p>
          <div className="flex flex-wrap gap-2">
            {session ? (
              <LinkButton href="/dashboard">Open the dashboard</LinkButton>
            ) : (
              <LinkButton href="/dashboard">
                {supabaseConfigured ? "Open the dashboard" : "Explore with sample data"}
              </LinkButton>
            )}
            <LinkButton variant="outline" href="/emission-engine">
              See the calculation engine
            </LinkButton>
            <LinkButton variant="ghost" href="/api-gateway">
              REST API
            </LinkButton>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-muted-foreground" />
              This deployment
            </CardTitle>
            <CardDescription>
              Reported from the same predicates the runtime uses, so it cannot disagree with how
              the application behaves.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Database</p>
                <Badge variant={isDbConfigured() ? "secondary" : "outline"}>
                  {isDbConfigured() ? "configured" : "not configured"}
                </Badge>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isDbConfigured()
                    ? "Reads and writes go to PostgreSQL."
                    : "Reads come from the bundled sample dataset — computed by the real engines — and writes are refused."}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Authentication</p>
                <Badge variant={supabaseConfigured ? "secondary" : "outline"}>
                  {supabaseConfigured ? "Supabase" : "demo session"}
                </Badge>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {supabaseConfigured
                    ? "Email, Google and Microsoft sign-in are available."
                    : "Supabase가 구성되지 않아 데모 관리자 세션으로 동작합니다."}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Narrative generation</p>
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
              <Card key={module.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Icon className="size-4 text-emerald-600" />
                    {module.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{module.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>

      <footer className="border-t bg-background px-6 py-4 text-center text-xs text-muted-foreground">
        Carbon Intelligence Operating System · GHG Protocol · ISO 14064 · SBTi · CDP · ISSB ·
        CSRD/ESRS
      </footer>
    </div>
  );
}
