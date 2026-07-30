/**
 * Activity data module.
 *
 * The entry table, the create form, the validation-rule results, the per-entry
 * data-quality scores and the CSV import mapping. Quality scores come from the
 * orchestrator's `quality.records`, keyed by `activityDataEntryId`, so the number in
 * the table is the same one the calculation used — not a second rubric.
 */

import { connection } from "next/server";
import { Activity, Gauge, ListChecks, ShieldCheck } from "lucide-react";

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
import { createActivityEntryAction } from "@/lib/actions/activity-data";
import { executeRuleSetAction } from "@/lib/actions/rules";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { isDbConfigured } from "@/lib/data/db";
import {
  listActivityData,
  listActivityEntries,
  listReportingYears,
} from "@/lib/data/repositories/activity-data";
import { getCalculationOutcome } from "@/lib/data/repositories/calculation";
import { listEmissionSources } from "@/lib/data/repositories/organization";
import { listRuleExecutions, listRuleSets } from "@/lib/data/repositories/rules";
import { formatDateTime, formatNumber, humaniseEnum } from "@/lib/format";
import { UNIT_REGISTRY } from "@/lib/reference/units";

import { CsvImport } from "./_components/csv-import";
import { EntryForm } from "./_components/entry-form";
import { EntryTable, type EntryRow } from "./_components/entry-table";
import { RuleRunner } from "./_components/rule-runner";

export default async function ActivityDataPage() {
  await connection();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const reportingYear = years[0] ?? new Date().getUTCFullYear();

  const [headers, entries, sources, ruleSets, ruleExecutions, outcome] = await Promise.all([
    listActivityData({ organizationId }),
    listActivityEntries({ organizationId }),
    listEmissionSources(organizationId),
    listRuleSets(organizationId),
    listRuleExecutions(organizationId, { limit: 25 }),
    getCalculationOutcome(organizationId, reportingYear),
  ]);

  const headerById = new Map(headers.map((header) => [header.id, header]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  // `quality.byResultId` carries the full `QualityScore` (including the derived
  // level); the results carry the entry id, so the two are joined here rather than
  // re-scoring anything on the page.
  const qualityByEntry = new Map(
    outcome.results.flatMap((result) => {
      const score = outcome.quality.byResultId[result.id];
      return score ? [[result.activityDataEntryId, score] as const] : [];
    }),
  );

  const rows: EntryRow[] = entries.map((entry) => {
    const quality = qualityByEntry.get(entry.id);
    return {
      id: entry.id,
      activityDataName: headerById.get(entry.activityDataId)?.name ?? entry.activityDataId,
      sourceName: sourceById.get(entry.emissionSourceId)?.name ?? "unassigned",
      scope: entry.scope,
      scope3Category: entry.scope3Category,
      quantity: entry.quantity,
      unit: entry.unit,
      startDate: entry.startDate.toISOString(),
      endDate: entry.endDate.toISOString(),
      isEstimated: entry.isEstimated,
      hasEvidence: entry.evidenceUrl !== null,
      uncertainty: entry.uncertainty,
      qualityScore: quality?.overallScore ?? null,
      qualityLevel: quality?.level ?? null,
    };
  });

  const estimatedShare =
    entries.length === 0
      ? 0
      : (entries.filter((entry) => entry.isEstimated).length / entries.length) * 100;
  const evidenceShare =
    entries.length === 0
      ? 0
      : (entries.filter((entry) => entry.evidenceUrl !== null).length / entries.length) * 100;

  const unitOptions = UNIT_REGISTRY.map((definition) => ({
    value: definition.unit,
    label: `${definition.unit} — ${definition.label}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity data"
        description="Every measured or estimated activity the inventory is built from, with its validation results and computed data quality."
        meta={[
          { label: "Reporting year", value: String(reportingYear) },
          { label: "Entries", value: formatNumber(entries.length) },
          { label: "Data sets", value: formatNumber(headers.length) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Entries"
          value={formatNumber(entries.length)}
          icon={Activity}
          description={`across ${headers.length} activity data sets`}
          source="listActivityEntries()"
        />
        <KpiCard
          title="Aggregate data quality"
          value={formatNumber(outcome.quality.aggregate.overallScore, 1)}
          unit="/ 100"
          icon={Gauge}
          description={`${outcome.quality.aggregate.level} · ${outcome.quality.aggregate.entryCount} scored`}
          source="aggregateQuality()"
        />
        <KpiCard
          title="Estimated entries"
          value={formatNumber(estimatedShare, 1)}
          unit="%"
          icon={ListChecks}
          description="metered data scores higher on reliability"
          source="ActivityDataEntry.isEstimated"
          goodDirection="down"
        />
        <KpiCard
          title="Entries with evidence"
          value={formatNumber(evidenceShare, 1)}
          unit="%"
          icon={ShieldCheck}
          description="evidence lifts the reliability dimension"
          source="ActivityDataEntry.evidenceUrl"
          goodDirection="up"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data-quality dimensions</CardTitle>
          <CardDescription>
            The five `DataQualityScore` dimensions, weighted by each entry&apos;s emissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5">
          {(
            [
              ["Completeness", outcome.quality.aggregate.completeness],
              ["Accuracy", outcome.quality.aggregate.accuracy],
              ["Timeliness", outcome.quality.aggregate.timeliness],
              ["Consistency", outcome.quality.aggregate.consistency],
              ["Reliability", outcome.quality.aggregate.reliability],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="space-y-1">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold">{formatNumber(value, 1)}</p>
              <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                />
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
          <CardDescription>
            {rows.length} row{rows.length === 1 ? "" : "s"}; the data-quality column is{" "}
            <code>scoreEntry()</code> output from the same run that produced the inventory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntryTable rows={rows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add, import and validate</CardTitle>
          <CardDescription>
            Manual entry, CSV column mapping and a rule-set dry run all go through the same
            server-side validation path.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="entry">
            <TabsList variant="line">
              <TabsTrigger value="entry">New entry</TabsTrigger>
              <TabsTrigger value="import">CSV import</TabsTrigger>
              <TabsTrigger value="rules">Validation rules</TabsTrigger>
            </TabsList>

            <TabsContent value="entry" className="pt-3">
              <EntryForm
                activityDataOptions={headers.map((header) => ({
                  value: header.id,
                  label: `${header.name} (${header.reportingYear})`,
                }))}
                emissionSourceOptions={sources.map((source) => ({
                  value: source.id,
                  label: source.name,
                }))}
                unitOptions={unitOptions}
                createEntry={createActivityEntryAction}
              />
            </TabsContent>

            <TabsContent value="import" className="pt-3">
              <CsvImport databaseConfigured={isDbConfigured()} />
            </TabsContent>

            <TabsContent value="rules" className="space-y-4 pt-3">
              {ruleSets.length === 0 ? (
                <EmptyState
                  title="No rule sets"
                  description="Seed or create a rule set to validate entries on save."
                />
              ) : (
                <>
                  <div className="space-y-2">
                    {ruleSets.map((ruleSet) => (
                      <div key={ruleSet.id} className="rounded-md border p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{ruleSet.name}</span>
                          <Badge variant={ruleSet.isActive ? "secondary" : "outline"}>
                            {ruleSet.isActive ? "active" : "inactive"}
                          </Badge>
                          <Badge variant="outline">{humaniseEnum(ruleSet.category)}</Badge>
                          <span className="text-xs text-muted-foreground">
                            priority {ruleSet.priority} · {ruleSet.rules.length} rule
                            {ruleSet.rules.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ruleSet.description}
                        </p>
                      </div>
                    ))}
                  </div>

                  <RuleRunner
                    organizationId={organizationId}
                    ruleSets={ruleSets.map((ruleSet) => ({
                      value: ruleSet.id,
                      label: ruleSet.name,
                    }))}
                    units={unitOptions}
                    executeRuleSet={executeRuleSetAction}
                  />

                  <div>
                    <p className="mb-1.5 text-sm font-medium">Recent rule executions</p>
                    {ruleExecutions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No <code>RuleExecution</code> rows: executions are persisted, and no
                        database is configured, so this list stays empty in demo mode.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {ruleExecutions.map((execution) => (
                          <li key={execution.id} className="text-xs">
                            <Badge
                              variant={execution.status === "matched" ? "secondary" : "outline"}
                              className="mr-1.5"
                            >
                              {execution.status}
                            </Badge>
                            {formatDateTime(execution.executedAt)} · {execution.triggerType}
                            {execution.errorMessage ? ` · ${execution.errorMessage}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
