/**
 * AI roadmap module.
 *
 * Milestone sequencing from `buildRoadmap()`, the MACC curve and least-cost
 * portfolio from `buildMaccCurve()`/`selectPortfolio()`, and NPV/IRR/payback per
 * technology from `analyseInvestment()`. The residual gap is the roadmap's own
 * arithmetic: required reduction minus the sum of the planned actions.
 */

import { connection } from "next/server";
import { Coins, Map as MapIcon, Target, TrendingDown } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MaccChart } from "@/components/charts/macc";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import {
  getMaccView,
  getRoadmapPlan,
  listAbatementTechnologies,
  listInvestmentAnalyses,
} from "@/lib/data/repositories/roadmap";
import {
  formatCurrency,
  formatDate,
  formatEmissions,
  formatNumber,
  formatPercent,
  humaniseEnum,
} from "@/lib/format";

type InvestmentRow = {
  readonly technologyId: string;
  readonly name: string;
  readonly capex: number;
  readonly annualSavings: number;
  readonly npv: number;
  readonly irr: number | null;
  readonly paybackPeriod: number | null;
  readonly roi: number;
  readonly riskLevel: string;
  readonly lcoa: number | null;
  readonly currency: string;
};

const investmentColumns: ColumnDef<InvestmentRow, unknown>[] = [
  { id: "name", header: "Measure", accessorFn: (row) => row.name },
  {
    id: "capex",
    header: "Capex",
    accessorFn: (row) => row.capex,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {formatCurrency(row.original.capex, row.original.currency)}
      </span>
    ),
  },
  {
    id: "annualSavings",
    header: "Annual saving",
    accessorFn: (row) => row.annualSavings,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {formatCurrency(row.original.annualSavings, row.original.currency)}
      </span>
    ),
  },
  {
    id: "npv",
    header: "NPV",
    accessorFn: (row) => row.npv,
    cell: ({ row }) => (
      <span
        className={`font-mono text-xs ${row.original.npv >= 0 ? "text-emerald-600" : "text-red-500"}`}
      >
        {formatCurrency(row.original.npv, row.original.currency)}
      </span>
    ),
  },
  {
    id: "irr",
    header: "IRR",
    accessorFn: (row) => row.irr ?? -1,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.irr === null ? "no solution" : formatPercent(row.original.irr * 100)}
      </span>
    ),
  },
  {
    id: "payback",
    header: "Payback",
    accessorFn: (row) => row.paybackPeriod ?? 999,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.paybackPeriod === null
          ? "never"
          : `${formatNumber(row.original.paybackPeriod, 1)} yr`}
      </span>
    ),
  },
  {
    id: "roi",
    header: "ROI",
    accessorFn: (row) => row.roi,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{formatPercent(row.original.roi * 100)}</span>
    ),
  },
  {
    id: "lcoa",
    header: "Cost per tonne",
    accessorFn: (row) => row.lcoa ?? 0,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.lcoa === null
          ? "—"
          : `${formatCurrency(row.original.lcoa, row.original.currency, 2)}/tCO2e`}
      </span>
    ),
  },
  {
    id: "risk",
    header: "Risk",
    accessorFn: (row) => row.riskLevel,
    cell: ({ row }) => <Badge variant="outline">{row.original.riskLevel}</Badge>,
  },
];

export default async function AiRoadmapPage() {
  await connection();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const currentYear = years[0] ?? new Date().getUTCFullYear();

  const [plan, macc, technologies, investments] = await Promise.all([
    getRoadmapPlan(organizationId),
    getMaccView(organizationId, { year: currentYear }),
    listAbatementTechnologies(),
    listInvestmentAnalyses(organizationId),
  ]);

  const technologyNames = new Map(
    technologies.map((technology) => [technology.id, technology.name]),
  );

  const investmentRows: InvestmentRow[] = investments.map((analysis) => ({
    technologyId: analysis.technologyId,
    name: analysis.name,
    capex: analysis.capex,
    annualSavings: analysis.annualSavings,
    npv: analysis.npv,
    irr: analysis.irr,
    paybackPeriod: analysis.paybackPeriod,
    roi: analysis.roi,
    riskLevel: analysis.riskLevel,
    lcoa: analysis.abatementCost?.lcoa ?? null,
    currency: analysis.currency,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI roadmap"
        description="Decarbonisation sequencing, marginal abatement cost curve, least-cost portfolio and investment appraisal."
        meta={[
          { label: "MACC year", value: String(macc.year) },
          { label: "Measures", value: formatNumber(macc.curve.points.length) },
          {
            label: "Abatement target",
            value: `${formatEmissions(macc.abatementTarget)} tCO2e`,
          },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Required reduction"
          value={formatEmissions(plan?.plan.requiredReduction ?? 0)}
          unit={plan?.plan.unit ?? "tCO2e"}
          icon={Target}
          description={
            plan
              ? `${plan.plan.roadmap.baselineYear} → ${plan.plan.roadmap.targetYear}`
              : "no roadmap"
          }
          source="buildRoadmap()"
        />
        <KpiCard
          title="Planned reduction"
          value={formatEmissions(plan?.plan.plannedReduction ?? 0)}
          unit={plan?.plan.unit ?? "tCO2e"}
          icon={MapIcon}
          description={`${plan?.plan.actions.length ?? 0} sequenced actions`}
          source="buildRoadmap()"
          goodDirection="up"
        />
        <KpiCard
          title="Residual gap"
          value={formatEmissions(plan?.plan.residualGap ?? 0)}
          unit={plan?.plan.unit ?? "tCO2e"}
          icon={TrendingDown}
          description={
            plan
              ? `${formatPercent(plan.plan.residualGapPercent * 100)} of the required reduction`
              : "—"
          }
          source="requiredReduction − plannedReduction"
        />
        <KpiCard
          title="Portfolio cost"
          value={formatCurrency(macc.portfolio.totalCost, macc.portfolio.currency)}
          icon={Coins}
          description={`${formatEmissions(macc.portfolio.totalAbatement)} tCO2e at ${formatCurrency(macc.portfolio.averageCost, macc.portfolio.currency, 2)}/tCO2e`}
          source="selectPortfolio()"
        />
      </div>

      {plan && plan.plan.residualGap > 0 && (
        <Alert variant="destructive" data-testid="residual-gap-callout">
          <Target />
          <AlertTitle>
            The plan is {formatEmissions(plan.plan.residualGap)} {plan.plan.unit} short of the
            target
          </AlertTitle>
          <AlertDescription className="space-y-1 text-xs">
            <p>
              {formatPercent(plan.plan.residualGapPercent * 100)} of the required reduction has
              no action against it. The cheapest unselected measures on the MACC below are the
              obvious candidates.
            </p>
            {plan.plan.warnings.length > 0 && (
              <ul className="list-inside list-disc">
                {plan.plan.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Marginal abatement cost curve</CardTitle>
          <CardDescription>
            Measures ordered cheapest first. Negative-cost measures pay for themselves; the
            marker shows where the cumulative abatement meets the target.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {macc.curve.points.length > 0 ? (
            <>
              <MaccChart
                points={macc.curve.points}
                currency={macc.curve.currency}
                abatementTarget={macc.abatementTarget}
              />
              <div className="grid gap-2 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Total potential</p>
                  <p className="font-mono">
                    {formatEmissions(macc.curve.totalAbatementPotential)} tCO2e
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Negative-cost abatement</p>
                  <p className="font-mono">
                    {formatEmissions(macc.curve.negativeCostAbatement)} tCO2e
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Average cost</p>
                  <p className="font-mono">
                    {formatCurrency(macc.curve.averageCost, macc.curve.currency, 2)}/tCO2e
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Target met by the portfolio</p>
                  <p className="font-mono">{macc.portfolio.meetsTarget ? "yes" : "no"}</p>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="No abatement technologies" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Least-cost portfolio</CardTitle>
          <CardDescription>
            {macc.portfolio.methodology}
            {macc.portfolio.unmetAbatement > 0
              ? ` ${formatEmissions(macc.portfolio.unmetAbatement)} tCO2e of the target is still unmet.`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {macc.portfolio.selections.length === 0 ? (
            <EmptyState title="Nothing selected" />
          ) : (
            macc.portfolio.selections.map((selection) => (
              <div
                key={selection.technologyId}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
              >
                <span className="font-medium">{selection.name}</span>
                {selection.isPartial && <Badge variant="outline">partial</Badge>}
                <span className="text-xs text-muted-foreground">
                  {formatEmissions(selection.selectedAbatement)} of{" "}
                  {formatEmissions(selection.availableAbatement)} tCO2e
                </span>
                <span className="ml-auto font-mono text-xs">
                  {formatCurrency(selection.marginalCost, macc.portfolio.currency, 2)}/tCO2e ·{" "}
                  {formatCurrency(selection.cost, macc.portfolio.currency)}
                </span>
              </div>
            ))
          )}
          {macc.portfolio.skipped.length > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              Skipped:{" "}
              {macc.portfolio.skipped
                .map(
                  (skip) =>
                    `${technologyNames.get(skip.technologyId) ?? skip.technologyId} (${skip.reason})`,
                )
                .join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roadmap milestones</CardTitle>
          <CardDescription>
            {plan
              ? `${plan.roadmap.name} — actions sequenced by priority and completion year.`
              : "No DecarbonizationRoadmap row for this organisation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {plan ? (
            <>
              <ol className="space-y-2">
                {plan.plan.milestones.map((milestone) => (
                  <li key={milestone.name} className="rounded-lg border p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{milestone.name}</span>
                      <Badge variant="secondary">{milestone.targetYear}</Badge>
                      <Badge variant="outline">{milestone.status}</Badge>
                      <span className="text-xs text-muted-foreground">
                        due {formatDate(milestone.dueDate)} · {milestone.actionIds.length} action
                        {milestone.actionIds.length === 1 ? "" : "s"}
                      </span>
                      <span className="ml-auto font-mono text-xs">
                        {formatEmissions(milestone.targetReduction)} {milestone.unit} cumulative
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{milestone.description}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(100, Math.max(0, milestone.currentProgress * 100))}%`,
                          }}
                        />
                      </span>
                      <span className="font-mono text-[11px]">
                        {formatPercent(milestone.currentProgress * 100)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Year</th>
                      <th className="px-2 py-1.5 text-right font-medium">Target</th>
                      <th className="px-2 py-1.5 text-right font-medium">Planned</th>
                      <th className="px-2 py-1.5 text-right font-medium">Cumulative reduction</th>
                      <th className="px-2 py-1.5 text-right font-medium">Gap to target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.plan.trajectory.map((point) => (
                      <tr key={point.year} className="border-t">
                        <td className="px-2 py-1">{point.year}</td>
                        <td className="px-2 py-1 text-right font-mono">
                          {formatEmissions(point.targetEmissions)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {formatEmissions(point.plannedEmissions)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {formatEmissions(point.cumulativeReduction)}
                        </td>
                        <td
                          className={`px-2 py-1 text-right font-mono ${point.gapToTarget > 0 ? "text-red-500" : "text-emerald-600"}`}
                        >
                          {formatEmissions(point.gapToTarget)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState title="No roadmap" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Investment appraisal</CardTitle>
          <CardDescription>
            NPV, IRR (bisection; `no solution` when the cash flow never crosses zero), payback,
            ROI and levelised cost of abatement per measure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            id="investment-table"
            columns={investmentColumns}
            data={investmentRows}
            pageSize={10}
            searchPlaceholder="Filter measures…"
            emptyState={<EmptyState title="No capex measures to appraise" />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abatement technologies</CardTitle>
          <CardDescription>
            The reference catalogue the MACC and the roadmap actions draw on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {technologies.map((technology) => (
            <div
              key={technology.id}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
            >
              <span className="font-medium">{technology.name}</span>
              <Badge variant="secondary">{humaniseEnum(technology.category)}</Badge>
              <span className="text-xs text-muted-foreground">
                {formatEmissions(technology.abatementPotential)} tCO2e potential ·{" "}
                {formatCurrency(technology.costPerTonne, "USD", 2)}/tCO2e · TRL{" "}
                {technology.technologyReadiness}
              </span>
              <span className="ml-auto font-mono text-xs">
                capex {formatCurrency(technology.capex)} · {technology.projectLifeYears} yr life
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
