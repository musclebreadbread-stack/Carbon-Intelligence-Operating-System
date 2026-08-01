/**
 * Emission engine module.
 *
 * The whole page is the orchestrator's output: `getCalculationOutcome()` runs
 * `runCalculation()` over the repository's activity entries and candidate factors,
 * and every number here — scope totals, uncertainty band, traces, lineage — comes
 * out of that one run.
 */

import { connection } from "next/server";
import { Activity, Calculator, Gauge, Sigma } from "lucide-react";

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
import { LineageGraph } from "@/components/shared/lineage-graph";
import { PageHeader } from "@/components/shared/page-header";
import {
  previewCalculationAction,
  runCalculationAction,
} from "@/lib/actions/calculation";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { GWP_VERSIONS } from "@/lib/core/enums";
import { CONSOLIDATION_APPROACHES } from "@/lib/domain/emissions/aggregate";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import {
  getCalculationOutcome,
  getInventory,
  listCalculations,
} from "@/lib/data/repositories/calculation";
import { getLineageGraph } from "@/lib/data/repositories/lineage";
import { listFacilities } from "@/lib/data/repositories/organization";
import {
  formatDateTime,
  formatEmissions,
  formatNumber,
  formatPercent,
  humaniseEnum,
  scopeLabel,
} from "@/lib/format";
import { toProvenanceTree } from "@/lib/domain/lineage/graph";
import { getDictionary } from "@/lib/i18n/server";

import { RunCalculationPanel } from "./_components/run-calculation-panel";
import { ScopeTotals } from "./_components/scope-totals";
import { TraceDrawer, type TracedResult } from "./_components/trace-drawer";

export default async function EmissionEnginePage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const reportingYear = years[0] ?? new Date().getUTCFullYear();

  const [inventory, outcome, calculations, facilities, lineage] = await Promise.all([
    getInventory(organizationId, reportingYear),
    getCalculationOutcome(organizationId, reportingYear),
    listCalculations(organizationId),
    listFacilities(organizationId),
    getLineageGraph(organizationId, reportingYear),
  ]);

  // The provenance tree is anchored on the largest result, which is the number a
  // reviewer asks about first.
  const anchorResult = [...outcome.results].sort((a, b) => b.totalCO2e - a.totalCO2e)[0];
  const provenance = anchorResult
    ? toProvenanceTree(lineage, `result:${anchorResult.id}`)
    : null;

  const traceByResult = new Map(outcome.traces.map((trace) => [trace.resultId, trace.steps]));
  const tracedResults: TracedResult[] = [...outcome.results]
    .sort((a, b) => b.totalCO2e - a.totalCO2e)
    .slice(0, 25)
    .map((result) => ({
      resultId: result.id,
      label: result.emissionSourceId ?? result.activityDataEntryId,
      scope: result.scope,
      totalCO2e: result.totalCO2e,
      unit: result.unit,
      method: result.method,
      dataQuality: result.dataQuality,
      factorRationale: outcome.factorSelections[result.activityDataEntryId] ?? [],
      steps: (traceByResult.get(result.id) ?? []).map((step) => ({
        stepName: step.stepName,
        formula: step.formula,
        inputs: step.inputs,
        output: step.output,
        unit: step.unit,
        notes: step.notes ?? null,
        orderIndex: step.orderIndex,
      })),
    }));

  const uncertainty = outcome.uncertainty;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["engine.title"]}
        description={dict["engine.desc"]}
        meta={[
          { label: dict["engine.meta.reportingYear"], value: String(reportingYear) },
          { label: dict["engine.meta.gwp"], value: inventory.gwpVersion },
          { label: dict["engine.meta.consolidation"], value: humaniseEnum(inventory.consolidationApproach) },
          { label: dict["engine.meta.scope2Basis"], value: humaniseEnum(inventory.totals.scope2Basis) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={dict["engine.kpi.totalEmissions"]}
          value={formatEmissions(inventory.totals.totalEmissions)}
          unit={inventory.totals.unit}
          icon={Calculator}
          description={`${inventory.totals.resultCount} ${dict["engine.kpi.emissionResults"]}`}
          source="buildInventory() over the calculated results"
        />
        <KpiCard
          title={dict["engine.kpi.overallUncertainty"]}
          value={`±${formatNumber(uncertainty.overallUncertainty, 2)}`}
          unit="%"
          icon={Gauge}
          description={`${formatNumber(uncertainty.confidenceLevel, 0)}% ${dict["engine.kpi.confidenceInterval"]}`}
          source="propagateUncertainty() quadrature"
        />
        <KpiCard
          title={dict["engine.kpi.dataQuality"]}
          value={formatNumber(outcome.quality.aggregate.overallScore, 1)}
          unit="/ 100"
          icon={Activity}
          description={outcome.quality.aggregate.level}
          source="aggregateQuality()"
          goodDirection="up"
        />
        <KpiCard
          title={dict["engine.kpi.traceSteps"]}
          value={formatNumber(
            outcome.traces.reduce((total, trace) => total + trace.steps.length, 0),
          )}
          icon={Sigma}
          description={`${outcome.traces.length} ${dict["engine.kpi.tracedResults"]}`}
          source="runCalculation() traces"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{dict["engine.card.inventoryByScope"]}</CardTitle>
          <CardDescription>
            {dict["engine.card.inventoryByScopeDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScopeTotals totals={inventory.totals} consolidated={inventory.consolidated} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dict["engine.card.uncertainty"]}</CardTitle>
            <CardDescription>
              {uncertainty.methodology}
              {uncertainty.notes ? ` ${uncertainty.notes}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-mono">
                {formatEmissions(uncertainty.lowerBound)} {inventory.totals.unit}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatNumber(uncertainty.confidenceLevel, 0)}% interval
              </span>
              <span className="font-mono">
                {formatEmissions(uncertainty.upperBound)} {inventory.totals.unit}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
              <span
                className="absolute inset-y-0 rounded-full bg-primary/40"
                style={{ left: "6%", right: "6%" }}
              />
              <span
                className="absolute inset-y-[-3px] w-0.5 bg-foreground"
                style={{ left: "50%" }}
              />
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Activity data</p>
                <p className="font-mono">
                  ±{formatNumber(uncertainty.activityDataUncertainty ?? 0, 2)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Emission factor</p>
                <p className="font-mono">
                  ±{formatNumber(uncertainty.emissionFactorUncertainty ?? 0, 2)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Methodology</p>
                <p className="font-mono">
                  ±{formatNumber(uncertainty.methodologyUncertainty ?? 0, 2)}%
                </p>
              </div>
            </div>
            {uncertainty.monteCarloIterations !== null && (
              <p className="text-xs text-muted-foreground">
                Monte Carlo: {formatNumber(uncertainty.monteCarloIterations)} iterations with a
                seeded PRNG, so the interval is reproducible.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{dict["engine.card.runCalculation"]}</CardTitle>
            <CardDescription>
              {dict["engine.card.runCalculationDesc"]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RunCalculationPanel
              organizationId={organizationId}
              years={years.length > 0 ? years : [reportingYear]}
              facilities={facilities.map((facility) => ({
                value: facility.id,
                label: facility.name,
              }))}
              gwpVersions={GWP_VERSIONS.map((version) => ({
                value: version,
                label: version,
              }))}
              consolidationApproaches={CONSOLIDATION_APPROACHES.map((approach: string) => ({
                value: approach,
                label: humaniseEnum(approach),
              }))}
              runCalculation={runCalculationAction}
              previewCalculation={previewCalculationAction}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{dict["engine.card.tracesAndLineage"]}</CardTitle>
          <CardDescription>
            {dict["engine.card.tracesAndLineageDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="traces">
            <TabsList variant="line">
              <TabsTrigger value="traces">{dict["engine.tab.traces"]}</TabsTrigger>
              <TabsTrigger value="calculations">{dict["engine.tab.calculationRecords"]}</TabsTrigger>
              <TabsTrigger value="lineage">{dict["engine.tab.lineage"]}</TabsTrigger>
            </TabsList>

            <TabsContent value="traces" className="pt-3">
              <TraceDrawer results={tracedResults} />
            </TabsContent>

            <TabsContent value="calculations" className="space-y-2 pt-3">
              {calculations.length === 0 ? (
                <EmptyState
                  title={dict["engine.empty.noCalculationRecords"]}
                  description={dict["engine.empty.noCalculationRecordsDesc"]}
                />
              ) : (
                calculations.map((calculation) => (
                  <div
                    key={calculation.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2.5"
                  >
                    <span className="text-sm font-medium">{calculation.name}</span>
                    <Badge variant="secondary">{scopeLabel(calculation.scope)}</Badge>
                    <Badge variant="outline">{calculation.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {calculation.resultCount} result
                      {calculation.resultCount === 1 ? "" : "s"} ·{" "}
                      {formatDateTime(calculation.calculatedAt)}
                    </span>
                    <span className="ml-auto font-mono text-xs">
                      {formatEmissions(calculation.totalEmissions)} {calculation.unit}
                    </span>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="lineage" className="space-y-3 pt-3">
              {provenance ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Provenance of the largest result (
                    {formatEmissions(anchorResult?.totalCO2e ?? 0)} {inventory.totals.unit},{" "}
                    {formatPercent(
                      inventory.totals.totalEmissions === 0
                        ? 0
                        : ((anchorResult?.totalCO2e ?? 0) / inventory.totals.totalEmissions) * 100,
                    )}{" "}
                    of the total). The full graph carries {lineage.nodes.length} nodes and{" "}
                    {lineage.edges.length} edges.
                  </p>
                  <LineageGraph tree={provenance} />
                </>
              ) : (
                <EmptyState
                  title={dict["engine.empty.noLineageGraph"]}
                  description={dict["engine.empty.noLineageGraphDesc"]}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
