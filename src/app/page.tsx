/**
 * Marketing landing page.
 *
 * Public, unauthenticated, Korean-first — the entry point for a prospect
 * (제조업 ESG/환경안전 담당자) rather than a returning user. The old
 * developer-status landing page moved to `/status`; a session holder is
 * still routed to `/dashboard`, and `/status` still exists for anyone who
 * wants to see what this deployment has configured.
 *
 * `PlanGateLocked` (src/components/shared/plan-gate.tsx) links back to
 * `/#pricing` on this page, so the pricing section's `id` must stay "pricing".
 */

import Link from "next/link";
import { connection } from "next/server";
import { BarChart3, Database, FileText, Leaf } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LinkButton } from "@/components/shared/link-button";
import { getSession } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/server";

import { submitTrialRequestAction } from "@/lib/actions/trial-request";
import { TrialRequestForm } from "./_components/trial-request-form";

export const metadata = {
  title: "CIOS — 제조업을 위한 탄소회계 플랫폼",
  description:
    "GHG Protocol 기준 Scope 1·2·3 배출량 계산부터 CDP·K-ETS 공시까지, 국내 중견·중소 제조업을 위한 한국어 탄소회계 플랫폼.",
};

const FEATURES = [
  {
    icon: Database,
    titleKey: "marketing.features.activityData.title",
    bodyKey: "marketing.features.activityData.body",
  },
  {
    icon: BarChart3,
    titleKey: "marketing.features.calculation.title",
    bodyKey: "marketing.features.calculation.body",
  },
  {
    icon: FileText,
    titleKey: "marketing.features.disclosure.title",
    bodyKey: "marketing.features.disclosure.body",
  },
] as const;

export default async function MarketingLandingPage() {
  await connection();

  const dict = await getDictionary();
  const session = await getSession();

  const plans = [
    {
      key: "starter",
      name: dict["marketing.pricing.starter.name"],
      price: dict["marketing.pricing.starter.price"],
      description: dict["marketing.pricing.starter.description"],
      highlighted: false,
    },
    {
      key: "growth",
      name: dict["marketing.pricing.growth.name"],
      price: dict["marketing.pricing.growth.price"],
      description: dict["marketing.pricing.growth.description"],
      highlighted: true,
    },
    {
      key: "enterprise",
      name: dict["marketing.pricing.enterprise.name"],
      price: dict["marketing.pricing.enterprise.price"],
      description: dict["marketing.pricing.enterprise.description"],
      highlighted: false,
    },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Leaf className="size-5 text-emerald-600" />
          <span className="text-sm font-semibold">CIOS</span>
        </div>
        <div className="flex items-center gap-2">
          {session ? (
            <LinkButton size="sm" href="/dashboard">
              {dict["landing.openDashboard"]}
            </LinkButton>
          ) : (
            <>
              <LinkButton size="sm" variant="ghost" href="/login">
                {dict["auth.login"]}
              </LinkButton>
              <LinkButton size="sm" href="#pricing">
                {dict["marketing.hero.ctaSecondary"]}
              </LinkButton>
            </>
          )}
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl space-y-5 px-6 py-20 text-center">
          <Badge variant="outline" className="mx-auto">
            {dict["marketing.hero.badge"]}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            {dict["marketing.hero.title"]}
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            {dict["marketing.hero.subtitle"]}
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <LinkButton size="lg" href="#trial">
              {dict["marketing.hero.ctaPrimary"]}
            </LinkButton>
            <LinkButton size="lg" variant="outline" href="#pricing">
              {dict["marketing.hero.ctaSecondary"]}
            </LinkButton>
          </div>
        </section>

        <section className="mx-auto max-w-5xl space-y-6 px-6 py-16">
          <h2 className="text-center text-xl font-semibold">{dict["marketing.features.title"]}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.titleKey}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Icon className="size-4 text-emerald-600" />
                      {dict[feature.titleKey]}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{dict[feature.bodyKey]}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-5xl space-y-6 px-6 py-16">
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold">{dict["marketing.pricing.title"]}</h2>
            <p className="text-sm text-muted-foreground">{dict["marketing.pricing.subtitle"]}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.key}
                className={plan.highlighted ? "border-emerald-500 shadow-md" : undefined}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {plan.name}
                    {plan.key === "growth" && (
                      <Badge>{dict["marketing.pricing.growth.badge"]}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold">
                    {plan.price}
                    {plan.key !== "enterprise" && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        / {dict["marketing.pricing.period"]}
                      </span>
                    )}
                  </p>
                  <LinkButton
                    href="#trial"
                    variant={plan.highlighted ? "default" : "outline"}
                    className="w-full"
                  >
                    {dict["marketing.hero.ctaPrimary"]}
                  </LinkButton>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="trial" className="mx-auto max-w-lg space-y-4 px-6 py-16">
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold">{dict["marketing.form.title"]}</h2>
            <p className="text-sm text-muted-foreground">{dict["marketing.form.subtitle"]}</p>
          </div>
          <TrialRequestForm submitTrialRequest={submitTrialRequestAction} />
        </section>
      </main>

      <footer className="space-y-2 border-t px-6 py-6 text-center text-xs text-muted-foreground">
        <p>{dict["marketing.footer"]}</p>
        <p className="flex justify-center gap-3">
          <Link href="/legal/terms" className="hover:underline">
            {dict["legal.terms.title"]}
          </Link>
          <Link href="/legal/privacy" className="hover:underline">
            {dict["legal.privacy.title"]}
          </Link>
        </p>
      </footer>
    </div>
  );
}
