/**
 * Dashboard.
 *
 * The cross-module overview: inventory KPIs against the prior year, the monthly
 * trend, scope composition, target progress, and the live feed of anomalies and
 * audit events. Every figure is read through the item-28 repositories, which run the
 * item-10/13 engines — there is no stored summary anywhere on this page.
 */

import { connection } from "next/server";
import {
  Activity,
  AlertTriangle,
  Factory,
  Gauge,
  Leaf,
  Target,
  Zap,
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
import { EmissionsTrendChart } from "@/components/charts/emissions-trend";
import { ScopeBreakdownChart } from "@/components/charts/scope-breakdown";
import { SCOPE_COLORS } from "@/components/charts/palette";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import {
  listActivityEntries,
  listReportingYears,
} from "@/lib/data/repositories/activity-data";
import { getAnomalyFeed } from "@/lib/data/repositories/ai";
import { listAuditTrail } from "@/lib/data/repositories/audit";
import {
  getCalculationOutcome,
  getInventory,
  inventoryIntensity,
} from "@/lib/data/repositories/calculation";
import { getCarbonFinanceView } from "@/lib/data/repositories/credits";
import { getNetZeroPlan, getTargetPathway, listTargets } from "@/lib/data/repositories/targets";
import {
  formatDateTime,
  formatEmissions,
  formatFraction,
  formatMonth,
  formatNumber,
  formatPercent,
  scopeLabel,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n/server";

export default async function DashboardPage() {
  await connection();

  const organizationId = await activeOrganizationId();
  const dict = await getDictionary();
  const years = await listReportingYears(organizationId);
  const currentYear = years[0] ?? new Date().getUTCFullYear();
  const priorYear = years[1] ?? currentYear - 1;

  const [current, prior, outcome, entries, targets, netZero, finance, anomalies, auditTrail] =
    await Promise.all([
      getInventory(organizationId, currentYear),
      getInventory(organizationId, priorYear),
      getCalculationOutcome(organizationId, currentYear),
      listActivityEntries({ organizationId }),
      listTargets(organizationId),
      getNetZeroPlan(organizationId),
      getCarbonFinanceView(organizationId, { reportingYear: currentYear }),
      getAnomalyFeed(organizationId),
      listAuditTrail({}, { limit: 8 }),
    ]);

  const anchorTarget = targets.find((target) => target.boundary === "SCOPE_1_2") ?? targets[0];
  const pathway = anchorTarget
    ? await getTargetPathway(organizationId, anchorTarget.id, { asOfYear: currentYear })
    : null;

  const change = (now: number, before: number): number | null =>
    before === 0 ? null : ((now - before) / before) * 100;

  const entryMonth = new Map(
    entries.map((entry) => [entry.id, formatMonth(entry.startDate)] as const),
  );
  const monthly = new Map<string, { scope1: number; scope2: number; scope3: number }>();
  for (const result of outcome.results) {
    const month = entryMonth.get(result.activityDataEntryId);
    if (!month) continue;
    const bucket = monthly.get(month) ?? { scope1: 0, scope2: 0, scope3: 0 };
    if (result.scope === "SCOPE_1") bucket.scope1 += result.totalCO2e;
    else if (result.scope === "SCOPE_2_LOCATION") bucket.scope2 += result.totalCO2e;
    else if (result.scope === "SCOPE_3") bucket.scope3 += result.totalCO2e;
    monthly.set(month, bucket);
  }
  const trendPoints = [...monthly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, values]) => ({ label, ...values }));

  const revenueProxy = Math.max(
    1,
    entries.reduce((total, entry) => total + entry.quantity, 0),
  );
  const intensity = inventoryIntensity(current.totals, {
    type: "PRODUCTION",
    value: revenueProxy,
    unit: "activity unit",
  });

  const criticalAnomalies = anomalies.filter(
    (anomaly) => anomaly.severity === "CRITICAL" || anomaly.severity === "HIGH",
  );

  // `NetZeroPlan.longTermReduction` and `abatedEmissions` are relative to the
  // target's baseline, so progress is expressed against the abatement the plan
  // requires rather than against an arbitrary denominator.
  const netZeroProgress =
    netZero && netZero.abatedEmissions > 0
      ? Math.max(
          0,
          Math.min(
            1,
            (netZero.abatedEmissions -
              Math.max(0, current.totals.totalEmissions - netZero.residualEmissions)) /
              netZero.abatedEmissions,
          ),
        )
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["dashboard.title"]}
        description={dict["app.description"]}
        meta={[
          { label: dict["dashboard.meta.reportingYear"], value: String(currentYear) },
          { label: dict["dashboard.meta.comparison"], value: String(priorYear) },
          { label: dict["dashboard.meta.gwp"], value: current.gwpVersion },
          { label: dict["dashboard.meta.scope2Basis"], value: current.totals.scope2Basis },
        ]}
        actions={
          <>
            <LinkButton size="sm" variant="outline" href="/emission-engine">
              {dict["dashboard.btn.runCalculation"]}
            </LinkButton>
            <LinkButton size="sm" href="/esg-disclosure">
              {dict["dashboard.btn.disclosureStatus"]}
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={dict["dashboard.kpi.totalEmissions"]}
          value={formatEmissions(current.totals.totalEmissions)}
          unit={current.totals.unit}
          icon={Factory}
          change={change(current.totals.totalEmissions, prior.totals.totalEmissions)}
          description={`${dict["dashboard.label.vs"]} ${priorYear}`}
          source="buildInventory()"
        />
        <KpiCard
          title={dict["dashboard.kpi.emissionIntensity"]}
          value={formatNumber(intensity.value, 5)}
          unit={intensity.unit}
          icon={Gauge}
          description={dict["dashboard.kpi.intensityDesc"]}
          source="intensity()"
        />
        <KpiCard
          title={dict["dashboard.kpi.scope1Direct"]}
          value={formatEmissions(current.totals.scope1Total)}
          unit={current.totals.unit}
          icon={Zap}
          change={change(current.totals.scope1Total, prior.totals.scope1Total)}
          description={`${dict["dashboard.label.vs"]} ${priorYear}`}
          source="buildInventory()"
        />
        <KpiCard
          title={dict["dashboard.kpi.scope2Location"]}
          value={formatEmissions(current.totals.scope2Location)}
          unit={current.totals.unit}
          icon={Zap}
          change={change(current.totals.scope2Location, prior.totals.scope2Location)}
          description={`${dict["dashboard.kpi.marketBasis"]} ${formatEmissions(current.totals.scope2Market)}`}
          source="buildInventory()"
        />
        <KpiCard
          title={dict["dashboard.kpi.scope3ValueChain"]}
          value={formatEmissions(current.totals.scope3Total)}
          unit={current.totals.unit}
          icon={Zap}
          change={change(current.totals.scope3Total, prior.totals.scope3Total)}
          description={`${Object.keys(current.totals.scope3ByCategory).length} ${dict["dashboard.kpi.categoriesOf15"]}`}
          source="buildInventory()"
        />
        <KpiCard
          title={dict["dashboard.kpi.netEmissions"]}
          value={formatEmissions(finance.net.netEmissions)}
          unit={finance.net.unit}
          icon={Leaf}
          description={`${formatPercent(finance.net.offsetShare * 100)} ${dict["dashboard.kpi.coveredByRetirements"]}`}
          source="netEmissions()"
        />
        <KpiCard
          title={dict["dashboard.kpi.targetProgress"]}
          value={
            pathway?.progress?.latest
              ? formatPercent(pathway.progress.latest.reductionPercent)
              : dict["dashboard.kpi.noTarget"]
          }
          icon={Target}
          description={
            pathway?.progress?.latest
              ? pathway.progress.isOnTrack
                ? dict["dashboard.kpi.onTrack"]
                : `${formatEmissions(pathway.progress.latest.gapToPathway ?? 0)} ${current.totals.unit} ${dict["dashboard.kpi.behindPathway"]}`
              : dict["dashboard.kpi.defineTarget"]
          }
          source="evaluateProgress()"
          goodDirection="up"
        />
        <KpiCard
          title={dict["dashboard.kpi.dataQuality"]}
          value={formatNumber(outcome.quality.aggregate.overallScore, 1)}
          unit="/ 100"
          icon={Activity}
          change={undefined}
          description={outcome.quality.aggregate.level}
          source="aggregateQuality()"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dict["dashboard.card.emissionsTrend"]}</CardTitle>
            <CardDescription>
              {dict["dashboard.card.emissionsTrendDesc"]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trendPoints.length > 0 ? (
              <EmissionsTrendChart points={trendPoints} unit={current.totals.unit} />
            ) : (
              <EmptyState title={dict["dashboard.empty.noMonthlySeries"]} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{dict["dashboard.card.scopeBreakdown"]}</CardTitle>
            <CardDescription>
              {dict["dashboard.card.scopeBreakdownDesc"]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScopeBreakdownChart
              unit={current.totals.unit}
              slices={[
                {
                  name: scopeLabel("SCOPE_1"),
                  value: current.totals.scope1Total,
                  color: SCOPE_COLORS.scope1,
                },
                {
                  name: scopeLabel("SCOPE_2_LOCATION"),
                  value: current.totals.scope2Location,
                  color: SCOPE_COLORS.scope2,
                },
                {
                  name: scopeLabel("SCOPE_3"),
                  value: current.totals.scope3Total,
                  color: SCOPE_COLORS.scope3,
                },
              ].filter((slice) => slice.value > 0)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dict["dashboard.card.targetsAndNetZero"]}</CardTitle>
            <CardDescription>
              {dict["dashboard.card.targetsAndNetZeroDesc"]}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {targets.length === 0 ? (
              <EmptyState title={dict["dashboard.empty.noTargets"]} />
            ) : (
              targets.map((target) => (
                <div key={target.id} className="rounded-md border p-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{target.name}</span>
                    <Badge variant="secondary">{target.boundary}</Badge>
                    <Badge variant="outline">{target.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {target.baselineYear} → {target.targetYear} ·{" "}
                      {formatPercent(target.targetReduction)} reduction
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    baseline {formatEmissions(target.baselineEmissions)} → current{" "}
                    {formatEmissions(target.currentEmissions)} {current.totals.unit}
                  </p>
                </div>
              ))
            )}
            {netZero && (
              <div className="rounded-md border bg-muted/40 p-2.5 text-xs">
                <p className="text-sm font-medium">
                  Net zero by {netZero.commitment.netZeroYear}
                </p>
                <p className="text-muted-foreground">
                  Residual {formatEmissions(netZero.residualEmissions)} {current.totals.unit} to
                  neutralise via {netZero.commitment.neutralizationStrategy}
                  {netZeroProgress !== null
                    ? ` · ${formatFraction(netZeroProgress)} of the way there`
                    : ""}
                </p>
                {netZeroProgress !== null && (
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-emerald-500"
                      style={{ width: `${netZeroProgress * 100}%` }}
                    />
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{dict["dashboard.card.attentionRequired"]}</CardTitle>
                <CardDescription>
                  {dict["dashboard.card.attentionRequiredDesc"]}
                </CardDescription>
              </div>
              <Badge variant={criticalAnomalies.length > 0 ? "destructive" : "secondary"}>
                {criticalAnomalies.length} {dict["dashboard.badge.highOrCritical"]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {anomalies.length === 0 ? (
              <EmptyState
                title={dict["dashboard.empty.nothingFlagged"]}
                description={dict["dashboard.empty.nothingFlaggedDesc"]}
              />
            ) : (
              anomalies.slice(0, 8).map((anomaly, index) => (
                <div
                  key={`${anomaly.emissionSourceId}-${anomaly.index}-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs"
                >
                  <AlertTriangle className="size-3.5 text-amber-600" />
                  <span className="font-medium">{anomaly.sourceName}</span>
                  <Badge variant="outline">{anomaly.severity}</Badge>
                  <Badge variant="outline">{anomaly.label}</Badge>
                  <span className="ml-auto font-mono text-muted-foreground">
                    {formatNumber(anomaly.detectedValue, 1)} vs expected{" "}
                    {formatNumber(anomaly.expectedValue, 1)} {anomaly.unit}
                  </span>
                </div>
              ))
            )}
            {anomalies.length > 8 && (
              <LinkButton size="xs" variant="ghost" href="/ai-engine">
                {dict["dashboard.btn.viewAllAnomalies"]} ({anomalies.length})
              </LinkButton>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{dict["dashboard.card.recentActivity"]}</CardTitle>
              <CardDescription>
                {dict["dashboard.card.recentActivityDesc"]}
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {current.computedFromFixtures
                ? dict["dashboard.badge.computedFromFixtures"]
                : dict["dashboard.badge.live"]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {auditTrail.length === 0 ? (
            <EmptyState
              title={dict["dashboard.empty.noAuditEntries"]}
              description={dict["dashboard.empty.noAuditEntriesDesc"]}
            />
          ) : (
            <div className="space-y-2">
              {auditTrail.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {entry.entityType} {entry.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.entityId}
                      {entry.reason ? ` — ${entry.reason}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dict["dashboard.card.whereNumbersCome"]}</CardTitle>
          <CardDescription>
            {dict["dashboard.card.whereNumbersComeDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <p>
            <code>buildInventory()</code> aggregated {formatNumber(outcome.results.length)}{" "}
            emission results from {formatNumber(entries.length)} activity entries, each with a
            factor resolved by <code>resolveFactor()</code> and a trace of{" "}
            {formatNumber(outcome.traces.reduce((total, trace) => total + trace.steps.length, 0))}{" "}
            steps.
          </p>
          <p>
            Uncertainty ±{formatNumber(outcome.uncertainty.overallUncertainty, 2)}% at{" "}
            {formatNumber(outcome.uncertainty.confidenceLevel, 0)}% confidence, from{" "}
            <code>propagateUncertainty()</code>. Data quality{" "}
            {formatNumber(outcome.quality.aggregate.overallScore, 1)} / 100 from{" "}
            <code>aggregateQuality()</code> over {outcome.quality.aggregate.entryCount} scored
            entries.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
