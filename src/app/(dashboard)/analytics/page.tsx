/**
 * Analytics module.
 *
 * Trend, scope composition, facility heatmap, intensity metrics and a year-on-year
 * waterfall — all derived from `getInventory()` per reporting year plus the monthly
 * activity series, so nothing here is a stored aggregate.
 */

import { connection } from "next/server";
import { BarChart3, Gauge, TrendingDown, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmissionsTrendChart } from "@/components/charts/emissions-trend";
import { Heatmap } from "@/components/charts/heatmap";
import { ScopeBreakdownChart } from "@/components/charts/scope-breakdown";
import { WaterfallChart } from "@/components/charts/waterfall";
import { SCOPE_COLORS } from "@/components/charts/palette";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { listActivityEntries, listReportingYears } from "@/lib/data/repositories/activity-data";
import {
  getCalculationOutcome,
  getInventory,
  inventoryIntensity,
} from "@/lib/data/repositories/calculation";
import { getEmissionsForecast } from "@/lib/data/repositories/ai";
import { listFacilities } from "@/lib/data/repositories/organization";
import { rollUp } from "@/lib/domain/emissions/aggregate";
import { formatEmissions, formatNumber, formatMonth, scopeLabel } from "@/lib/format";
import { isScope3Category, scope3Definition } from "@/lib/reference/scope3-categories";

export default async function AnalyticsPage() {
  await connection();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const currentYear = years[0] ?? new Date().getUTCFullYear();
  const priorYear = years[1] ?? currentYear - 1;

  const [current, prior, outcome, facilities, entries, forecast] = await Promise.all([
    getInventory(organizationId, currentYear),
    getInventory(organizationId, priorYear),
    // The outcome's results carry `activityDataEntryId`, which is what makes the
    // monthly attribution below exact in both database and demo mode.
    getCalculationOutcome(organizationId, currentYear),
    listFacilities(organizationId),
    listActivityEntries({ organizationId }),
    getEmissionsForecast(organizationId, { horizon: 3 }),
  ]);

  const facilityNames = new Map(facilities.map((facility) => [facility.id, facility.name]));

  // ---- monthly trend: emissions attributed to the month of each entry ------
  // Each result names the activity entry it came from, so the monthly series is the
  // calculated result grouped by the entry's period rather than a stored bucket.
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

  // ---- scope composition --------------------------------------------------
  const scopeSlices = [
    { name: scopeLabel("SCOPE_1"), value: current.totals.scope1Total, color: SCOPE_COLORS.scope1 },
    {
      name: scopeLabel("SCOPE_2_LOCATION"),
      value: current.totals.scope2Location,
      color: SCOPE_COLORS.scope2,
    },
    { name: scopeLabel("SCOPE_3"), value: current.totals.scope3Total, color: SCOPE_COLORS.scope3 },
  ].filter((slice) => slice.value > 0);

  const scope3Slices = Object.entries(current.totals.scope3ByCategory)
    .filter(([, value]) => (value ?? 0) > 0)
    .map(([category, value]) => ({
      name: isScope3Category(category)
        ? `${scope3Definition(category).number}. ${scope3Definition(category).nameEn}`
        : category,
      value: value ?? 0,
    }));

  // ---- facility heatmap: facility × scope ---------------------------------
  const heatmapCells = (["SCOPE_1", "SCOPE_2_LOCATION", "SCOPE_3"] as const).flatMap((scope) =>
    rollUp(
      current.results.filter((result) => result.scope === scope),
      "facilityId",
    ).map((node) => ({
      row: node.key ? (facilityNames.get(node.key) ?? node.key) : "unassigned",
      column: scopeLabel(scope),
      value: node.totals.totalEmissions,
    })),
  );

  // ---- intensity metrics --------------------------------------------------
  const totalArea = facilities.reduce((total, facility) => total + (facility.area ?? 0), 0);
  const intensities = [
    inventoryIntensity(current.totals, { type: "AREA", value: totalArea, unit: "sqm" }),
    inventoryIntensity(current.totals, {
      type: "FTE",
      value: Math.max(1, facilities.length * 250),
      unit: "FTE",
    }),
    inventoryIntensity(current.totals, {
      type: "PRODUCTION",
      value: Math.max(1, entries.reduce((total, entry) => total + entry.quantity, 0)),
      unit: "activity unit",
    }),
  ];

  // ---- year-on-year waterfall -------------------------------------------
  const waterfallSteps = [
    { label: `${priorYear} total`, delta: prior.totals.totalEmissions, isTotal: true },
    { label: "Scope 1", delta: current.totals.scope1Total - prior.totals.scope1Total },
    { label: "Scope 2", delta: current.totals.scope2Location - prior.totals.scope2Location },
    { label: "Scope 3", delta: current.totals.scope3Total - prior.totals.scope3Total },
    { label: `${currentYear} total`, delta: current.totals.totalEmissions, isTotal: true },
  ];

  const yoyChange =
    prior.totals.totalEmissions === 0
      ? null
      : ((current.totals.totalEmissions - prior.totals.totalEmissions) /
          prior.totals.totalEmissions) *
        100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Trend, composition, facility comparison, intensity and year-on-year attribution — computed from the calculated inventory."
        meta={[
          { label: "Current year", value: String(currentYear) },
          { label: "Comparison year", value: String(priorYear) },
          { label: "Scope 2 basis", value: current.totals.scope2Basis },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={`${currentYear} total`}
          value={formatEmissions(current.totals.totalEmissions)}
          unit={current.totals.unit}
          icon={BarChart3}
          change={yoyChange}
          description={`vs ${priorYear}`}
          source="buildInventory()"
        />
        <KpiCard
          title="Intensity per sqm"
          value={formatNumber(intensities[0].value, 4)}
          unit={intensities[0].unit}
          icon={Gauge}
          description={`over ${formatNumber(totalArea)} sqm of floor area`}
          source="intensity()"
        />
        <KpiCard
          title="Scope 3 share"
          value={formatNumber(
            current.totals.totalEmissions === 0
              ? 0
              : (current.totals.scope3Total / current.totals.totalEmissions) * 100,
            1,
          )}
          unit="%"
          icon={Users}
          description="SBTi requires Scope 3 targets above 40%"
          source="buildInventory()"
          goodDirection="neutral"
        />
        <KpiCard
          title={`Forecast ${forecast.predictions.at(-1)?.horizon ?? ""}`}
          value={formatEmissions(forecast.predictions.at(-1)?.predictedValue ?? 0)}
          unit={current.totals.unit}
          icon={TrendingDown}
          description={`${forecast.model.method} fit, R² ${formatNumber(forecast.model.rSquared, 3)}`}
          source="forecast()"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly emissions by scope</CardTitle>
            <CardDescription>
              Calculated results attributed to the month of their activity period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trendPoints.length > 0 ? (
              <EmissionsTrendChart points={trendPoints} unit={current.totals.unit} />
            ) : (
              <EmptyState
                title="No monthly series"
                description="Activity entries carry no period that maps onto a month."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scope composition</CardTitle>
            <CardDescription>
              Share of the {formatEmissions(current.totals.totalEmissions)}{" "}
              {current.totals.unit} total.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScopeBreakdownChart slices={scopeSlices} unit={current.totals.unit} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scope 3 by category</CardTitle>
            <CardDescription>
              {scope3Slices.length} of 15 GHG Protocol categories carry data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scope3Slices.length > 0 ? (
              <ScopeBreakdownChart slices={scope3Slices} unit={current.totals.unit} />
            ) : (
              <EmptyState title="No Scope 3 data" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Year-on-year attribution</CardTitle>
            <CardDescription>
              How {priorYear} became {currentYear}, split by scope.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WaterfallChart steps={waterfallSteps} unit={current.totals.unit} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Facility heatmap</CardTitle>
          <CardDescription>
            Emissions per facility and scope, from `rollUp()` at the facility level. The
            colour ramp is scaled to the largest cell, so an outlier cannot hide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {heatmapCells.length > 0 ? (
            <Heatmap cells={heatmapCells} unit={current.totals.unit} />
          ) : (
            <EmptyState title="No facility-level results" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Intensity metrics</CardTitle>
          <CardDescription>
            `intensity()` returns 0 rather than Infinity for a zero denominator, so a missing
            denominator is visible as a zero with its basis shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {intensities.map((metric) => (
            <div key={metric.denominator} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{metric.denominator}</p>
              <p className="text-xl font-semibold">
                {formatNumber(metric.value, 5)}{" "}
                <span className="text-sm font-normal text-muted-foreground">{metric.unit}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatEmissions(metric.numerator)} {current.totals.unit} ÷{" "}
                {formatNumber(metric.denominatorValue)} {metric.unit.split("/")[1]}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Forecast</CardTitle>
          <CardDescription>
            {forecast.methodology} — deterministic statistics, not a language model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {forecast.predictions.map((prediction) => (
            <div
              key={prediction.horizon}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
            >
              <span className="font-medium">{prediction.horizon}</span>
              <Badge variant="outline">
                {formatEmissions(prediction.predictedValue)} {current.totals.unit}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatNumber(forecast.confidenceLevel, 0)}% interval{" "}
                {formatEmissions(prediction.lowerBound)} – {formatEmissions(prediction.upperBound)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
