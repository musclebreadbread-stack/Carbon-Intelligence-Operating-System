/**
 * AI simulator module.
 *
 * Every published scenario projected by `projectScenario()` from the *calculated*
 * baseline inventory, charted against the SBTi absolute-contraction pathway,
 * plus carbon-budget consumption and a side-by-side comparison.
 */

import { connection } from "next/server";
import { FlaskConical, Gauge, Target, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PathwayChart, type PathwayPoint } from "@/components/charts/pathway";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import {
  previewScenarioAction,
  simulateScenarioAction,
} from "@/lib/actions/scenario";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { SCENARIO_TYPES } from "@/lib/core/enums";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import { getInventory } from "@/lib/data/repositories/calculation";
import {
  DEMO_SCENARIO_COMPARISON_LIST,
  getBudgetConsumption,
  getScenarioComparison,
  listScenarioProjections,
} from "@/lib/data/repositories/scenario";
import { getTargetPathway, listTargets } from "@/lib/data/repositories/targets";
import {
  SCENARIO_DEFAULT_LEVERS,
  SCENARIO_LEVERS,
} from "@/lib/domain/scenarios/project";
import {
  formatCurrency,
  formatEmissions,
  formatFraction,
  formatNumber,
  formatPercent,
  humaniseEnum,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n/server";

import { ProjectionTable } from "./_components/projection-table";
import { ScenarioBuilder, type LeverSpec } from "./_components/scenario-builder";

const LEVER_LABELS: Readonly<Record<string, string>> = {
  activityGrowthRate: "Activity growth (per year, fraction)",
  energyEfficiencyRate: "Energy-intensity reduction (per year)",
  renewableShareTarget: "Renewable share at target year (0–1)",
  fuelSwitchRate: "Fuel switching (per year)",
  supplyChainEngagementRate: "Supplier engagement (per year)",
  abatementAmbition: "Additional abatement ambition (0–1)",
  residualFloor: "Residual floor (0–1)",
  carbonPrice: "Carbon price in the base year",
  carbonPriceGrowthRate: "Carbon-price growth (per year)",
  abatementCostPerTonne: "Abatement cost per tonne",
};

const LEVER_DESCRIPTIONS: Readonly<Record<string, string>> = {
  activityGrowthRate: "Grows gross emissions before abatement is applied.",
  energyEfficiencyRate: "Reduces Scope 1 and 2 intensity every year.",
  renewableShareTarget: "Ramps linearly to this share, cutting Scope 2.",
  fuelSwitchRate: "Displaces fossil Scope 1 with a cleaner carrier.",
  supplyChainEngagementRate: "Annual Scope 3 reduction from supplier programmes.",
  abatementAmbition: "Phases in extra abatement above the residual floor.",
  residualFloor: "Share of the base year that cannot be abated.",
  carbonPrice: "Drives the carbon-price exposure line.",
  carbonPriceGrowthRate: "Annual escalation of the carbon price.",
  abatementCostPerTonne: "Cost applied to every abated tonne.",
};

export default async function AiSimulatorPage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const currentYear = years[0] ?? new Date().getUTCFullYear();

  const [inventory, projections, targets, budget] = await Promise.all([
    getInventory(organizationId, currentYear),
    listScenarioProjections(organizationId),
    listTargets(organizationId),
    getBudgetConsumption(organizationId),
  ]);

  const anchorTarget = targets.find((target) => target.boundary === "SCOPE_1_2") ?? targets[0];
  const pathwayView = anchorTarget
    ? await getTargetPathway(organizationId, anchorTarget.id, { asOfYear: currentYear })
    : null;

  const comparison = DEMO_SCENARIO_COMPARISON_LIST[0]
    ? await getScenarioComparison(organizationId, DEMO_SCENARIO_COMPARISON_LIST[0].id)
    : null;

  const netZero = projections.find((view) => view.scenario.type === "NET_ZERO");
  const bau = projections.find((view) => view.scenario.type === "BAU");

  // ---- chart: SBTi pathway vs the net-zero scenario ------------------------
  const chartYears = [
    ...new Set([
      ...(pathwayView?.pathway.points.map((point) => point.year) ?? []),
      ...(netZero?.projection.points.map((point) => point.year) ?? []),
    ]),
  ].sort((a, b) => a - b);

  const pathwayByYear = new Map(
    (pathwayView?.pathway.points ?? []).map((point) => [point.year, point.targetEmissions]),
  );
  const scenarioByYear = new Map(
    (netZero?.projection.points ?? []).map((point) => [point.year, point.totalEmissions]),
  );

  const chartPoints: PathwayPoint[] = chartYears.map((year) => ({
    year,
    pathway: pathwayByYear.get(year) ?? null,
    scenario: scenarioByYear.get(year) ?? null,
    actual: year === currentYear ? inventory.totals.totalEmissions : null,
  }));

  const levers: LeverSpec[] = SCENARIO_LEVERS.map((lever) => ({
    name: lever,
    label: LEVER_LABELS[lever] ?? lever,
    description: LEVER_DESCRIPTIONS[lever] ?? "",
    defaultValue: SCENARIO_DEFAULT_LEVERS.NET_ZERO[lever],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["simulator.title"]}
        description={dict["simulator.desc"]}
        meta={[
          { label: dict["simulator.meta.baselineYear"], value: String(currentYear) },
          { label: dict["simulator.meta.scenarios"], value: formatNumber(projections.length) },
          {
            label: dict["simulator.meta.baselineEmissions"],
            value: `${formatEmissions(inventory.totals.totalEmissions)} ${inventory.totals.unit}`,
          },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Net-zero target year"
          value={String(netZero?.scenario.targetYear ?? "—")}
          icon={Target}
          description={
            netZero
              ? `${formatEmissions(netZero.projection.targetEmissions)} ${netZero.projection.unit} residual`
              : "no net-zero scenario"
          }
          source="projectScenario()"
        />
        <KpiCard
          title="Net-zero reduction"
          value={formatFraction(netZero?.projection.targetReduction ?? 0)}
          icon={FlaskConical}
          description="baseline to target year"
          source="projectScenario()"
          goodDirection="up"
        />
        <KpiCard
          title="BAU at target year"
          value={formatEmissions(bau?.projection.targetEmissions ?? 0)}
          unit={inventory.totals.unit}
          icon={Gauge}
          description={
            bau && netZero
              ? `${formatEmissions(bau.projection.targetEmissions - netZero.projection.targetEmissions)} ${inventory.totals.unit} gap to net zero`
              : "no BAU scenario"
          }
          source="projectScenario()"
          goodDirection="down"
        />
        <KpiCard
          title="Carbon budget used"
          value={formatPercent((budget?.consumption.utilisation ?? 0) * 100)}
          icon={Wallet}
          description={
            budget
              ? `${formatEmissions(budget.consumption.remainingBudget)} ${budget.consumption.unit} left${
                  budget.consumption.overshootYear
                    ? `, overshoot in ${budget.consumption.overshootYear}`
                    : ""
                }`
              : "no carbon budget set"
          }
          source="consumeBudget()"
          goodDirection="down"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Net-zero scenario against the SBTi pathway</CardTitle>
          <CardDescription>
            {pathwayView
              ? `Required pathway: ${pathwayView.pathway.methodology}. Scenario: ${netZero?.projection.methodology ?? "—"}.`
              : "No science-based target is defined, so only the scenario is charted."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartPoints.length > 0 ? (
            <PathwayChart
              points={chartPoints}
              unit={inventory.totals.unit}
              markerYear={anchorTarget?.targetYear ?? null}
              scenarioLabel={netZero?.scenario.name ?? "Scenario"}
            />
          ) : (
            <EmptyState title="No projection to chart" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scenario library</CardTitle>
          <CardDescription>
            Each scenario is projected from the same calculated baseline, so the differences
            are entirely down to the lever sets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={projections[0]?.scenario.id ?? "none"}>
            <TabsList className="flex-wrap" variant="line">
              {projections.map((view) => (
                <TabsTrigger key={view.scenario.id} value={view.scenario.id}>
                  {humaniseEnum(view.scenario.type)}
                </TabsTrigger>
              ))}
            </TabsList>
            {projections.map((view) => (
              <TabsContent key={view.scenario.id} value={view.scenario.id} className="space-y-3 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{view.scenario.name}</span>
                  <Badge variant="secondary">{humaniseEnum(view.scenario.type)}</Badge>
                  <Badge variant="outline">
                    {view.scenario.baselineYear} → {view.scenario.targetYear}
                  </Badge>
                  <Badge variant="outline">
                    {formatFraction(view.projection.targetReduction)} reduction
                  </Badge>
                  <Badge variant="outline">
                    cumulative {formatEmissions(view.projection.cumulativeEmissions)}{" "}
                    {view.projection.unit}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{view.projection.methodology}</p>
                <div className="flex flex-wrap gap-1.5">
                  {view.projection.assumptions.map((assumption) => (
                    <Badge key={assumption.parameter} variant="outline" className="font-mono">
                      {assumption.parameter}={formatNumber(assumption.value, 4)}
                    </Badge>
                  ))}
                </div>
                <ProjectionTable
                  points={view.projection.points}
                  highlightYears={[2030, 2040, 2050]}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Carbon budget</CardTitle>
            <CardDescription>
              {budget
                ? `${budget.budget.name} — ${budget.consumption.methodology}`
                : "No CarbonBudget row for this organisation."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {budget ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between text-sm">
                  <span>
                    {formatEmissions(budget.consumption.usedBudget)} used of{" "}
                    {formatEmissions(budget.consumption.totalBudget)} {budget.consumption.unit}
                  </span>
                  <Badge variant={budget.consumption.status === "exhausted" ? "destructive" : "secondary"}>
                    {budget.consumption.status}
                  </Badge>
                </div>
                <span className="block h-2 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, budget.consumption.utilisation * 100)}%`,
                    }}
                  />
                </span>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left font-medium">Year</th>
                      <th className="text-right font-medium">Emissions</th>
                      <th className="text-right font-medium">Cumulative</th>
                      <th className="text-right font-medium">Remaining</th>
                      <th className="text-right font-medium">Utilisation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budget.consumption.years.map((year) => (
                      <tr key={year.year} className="border-t">
                        <td className="py-1">
                          {year.year}
                          {year.isOvershoot && (
                            <Badge variant="destructive" className="ml-1.5">
                              overshoot
                            </Badge>
                          )}
                        </td>
                        <td className="py-1 text-right font-mono">
                          {formatEmissions(year.emissions)}
                        </td>
                        <td className="py-1 text-right font-mono">
                          {formatEmissions(year.cumulativeEmissions)}
                        </td>
                        <td className="py-1 text-right font-mono">
                          {formatEmissions(year.remainingBudget)}
                        </td>
                        <td className="py-1 text-right font-mono">
                          {formatPercent(year.utilisation * 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {budget.consumption.missingYears.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    No data for {budget.consumption.missingYears.join(", ")} — the utilisation
                    figure covers only the reported years.
                  </p>
                )}
                {budget.consumption.remainingAnnualAllowance !== null && (
                  <p className="text-xs text-muted-foreground">
                    Even allowance for the remaining years:{" "}
                    {formatEmissions(budget.consumption.remainingAnnualAllowance)}{" "}
                    {budget.consumption.unit} per year.
                  </p>
                )}
              </div>
            ) : (
              <EmptyState title="No carbon budget" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scenario comparison</CardTitle>
            <CardDescription>
              {comparison
                ? comparison.name
                : "No stored comparison; build one from the scenario library."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {comparison ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium">Metric</th>
                    <th className="text-right font-medium">A</th>
                    <th className="text-right font-medium">B</th>
                    <th className="text-right font-medium">B − A</th>
                    <th className="text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.comparison.map((row) => (
                    <tr key={row.metric} className="border-t">
                      <td className="py-1">{humaniseEnum(row.metric)}</td>
                      <td className="py-1 text-right font-mono">
                        {row.scenarioAValue === null ? "—" : formatNumber(row.scenarioAValue, 1)}
                      </td>
                      <td className="py-1 text-right font-mono">
                        {row.scenarioBValue === null ? "—" : formatNumber(row.scenarioBValue, 1)}
                      </td>
                      <td className="py-1 text-right font-mono">
                        {row.difference === null ? "—" : formatNumber(row.difference, 1)}
                      </td>
                      <td className="py-1 text-right font-mono">
                        {row.percentChange === null ? "—" : formatPercent(row.percentChange)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No comparison" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Build a scenario</CardTitle>
          <CardDescription>
            Levers are pre-filled with the net-zero default set. Projecting is read-only and
            works with no database; simulating persists the `ScenarioResult` series.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScenarioBuilder
            organizationId={organizationId}
            scenarioTypes={SCENARIO_TYPES.map((type) => ({
              value: type,
              label: humaniseEnum(type),
            }))}
            levers={levers}
            baseline={{
              year: currentYear,
              scope1Emissions: inventory.totals.scope1Total,
              scope2Emissions: inventory.totals.scope2Location,
              scope3Emissions: inventory.totals.scope3Total,
            }}
            defaultTargetYear={anchorTarget?.targetYear ?? currentYear + 10}
            currency="USD"
            simulateScenario={simulateScenarioAction}
            previewScenario={previewScenarioAction}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Default lever sets exist for every `ScenarioType`; the net-zero set targets{" "}
            {formatFraction(SCENARIO_DEFAULT_LEVERS.NET_ZERO.abatementAmbition)} additional
            abatement over a {formatFraction(SCENARIO_DEFAULT_LEVERS.NET_ZERO.residualFloor)}{" "}
            residual floor, priced at{" "}
            {formatCurrency(SCENARIO_DEFAULT_LEVERS.NET_ZERO.abatementCostPerTonne)} per tonne.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
