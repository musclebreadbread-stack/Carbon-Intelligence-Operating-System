/**
 * Digital MRV module.
 *
 * Monitoring plans, parameters, coverage gaps and measurement completeness — all
 * from `monitoringPlanCoverage()` and `measurementCompleteness()`, which derive the
 * expected reading count from each parameter's `MeasurementFrequency` rather than
 * from a stored target.
 */

import { connection } from "next/server";
import { Activity, Gauge, Radio, Ruler } from "lucide-react";

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
import { ActionForm } from "@/components/shared/form/action-form";
import { recordMeterReadingAction } from "@/lib/actions/activity-data";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import { getMrvCoverage, listMeasurements } from "@/lib/data/repositories/mrv";
import { listFacilities } from "@/lib/data/repositories/organization";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  humaniseEnum,
  scopeLabel,
} from "@/lib/format";
import { UNIT_REGISTRY } from "@/lib/reference/units";
import { getDictionary } from "@/lib/i18n/server";

export default async function DigitalMrvPage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const reportingYear = years[0] ?? new Date().getUTCFullYear();

  const [mrv, facilities] = await Promise.all([
    getMrvCoverage(organizationId, { reportingYear }),
    listFacilities(organizationId),
  ]);

  const measurements = mrv.plan
    ? await listMeasurements(mrv.plan.id, { reportingYear })
    : [];

  if (!mrv.plan || !mrv.coverage || !mrv.completeness || !mrv.monitoringPlan) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={dict["mrv.title"]}
          description={dict["mrv.desc"]}
        />
        <EmptyState
          title={dict["mrv.empty.noMrvPlan"]}
          description={dict["mrv.empty.noMrvPlanDesc"]}
        />
      </div>
    );
  }

  const { plan, monitoringPlan, parameters, coverage, completeness } = mrv;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["mrv.title"]}
        description={dict["mrv.desc"]}
        meta={[
          { label: dict["mrv.meta.plan"], value: plan.name },
          { label: dict["mrv.meta.framework"], value: plan.framework || "\u2014" },
          { label: dict["mrv.meta.status"], value: humaniseEnum(plan.status) },
          { label: dict["mrv.meta.reportingYear"], value: String(reportingYear) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Source coverage"
          value={formatPercent(coverage.coverage * 100)}
          icon={Radio}
          description={`${coverage.coveredSourceCount} of ${coverage.sourceCount} sources monitored`}
          source="monitoringPlanCoverage()"
          goodDirection="up"
        />
        <KpiCard
          title="Measurement completeness"
          value={formatPercent(completeness.completeness * 100)}
          icon={Gauge}
          description={`${formatNumber(completeness.totalRecorded)} of ${formatNumber(completeness.totalExpected)} expected readings`}
          source="measurementCompleteness()"
          goodDirection="up"
        />
        <KpiCard
          title="Verified readings"
          value={formatPercent(completeness.verifiedShare * 100)}
          icon={Ruler}
          description={`${formatNumber(completeness.totalVerified)} readings verified`}
          source="Measurement.verifiedAt"
          goodDirection="up"
        />
        <KpiCard
          title="Monitored parameters"
          value={formatNumber(parameters.length)}
          icon={Activity}
          description={`plan frequency ${humaniseEnum(monitoringPlan.frequency)}`}
          source="listMonitoringParameters()"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coverage by scope</CardTitle>
          <CardDescription>
            Only *active* sources are required to be covered; a parameter that points at a
            source outside the boundary is reported as an orphan, because measuring something
            out of scope is as much a finding as missing something in scope.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {Object.entries(coverage.byScope).map(([scope, counts]) => (
              <div key={scope} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{scopeLabel(scope)}</p>
                <p className="text-lg font-semibold">
                  {counts?.covered ?? 0} / {counts?.total ?? 0}
                </p>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{
                      width: `${counts && counts.total > 0 ? (counts.covered / counts.total) * 100 : 0}%`,
                    }}
                  />
                </span>
              </div>
            ))}
          </div>

          {coverage.uncovered.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">
                Coverage gaps ({coverage.uncovered.length})
              </p>
              <ul className="space-y-1">
                {coverage.uncovered.map((gap) => (
                  <li
                    key={gap.sourceId}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 p-2 text-xs"
                  >
                    <span className="font-medium">{gap.sourceName}</span>
                    <Badge variant="secondary">{scopeLabel(gap.scope)}</Badge>
                    <span className="text-muted-foreground">{gap.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coverage.orphanParameterIds.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {coverage.orphanParameterIds.length} parameter
              {coverage.orphanParameterIds.length === 1 ? "" : "s"} reference no source in the
              boundary: {coverage.orphanParameterIds.join(", ")}
            </p>
          )}

          {coverage.isComplete && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Every active emission source is covered by at least one monitoring parameter.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parameters, readings and devices</CardTitle>
          <CardDescription>
            Expected reading counts come from each parameter&apos;s frequency over the reporting
            period — HOURLY over 30 days expects 720 readings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="completeness">
            <TabsList className="flex-wrap" variant="line">
              <TabsTrigger value="completeness">Completeness</TabsTrigger>
              <TabsTrigger value="parameters">Parameters ({parameters.length})</TabsTrigger>
              <TabsTrigger value="readings">Readings ({measurements.length})</TabsTrigger>
              <TabsTrigger value="meter">Record a meter reading</TabsTrigger>
            </TabsList>

            <TabsContent value="completeness" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Period {formatDate(completeness.period.start)} →{" "}
                {formatDate(completeness.period.end)} ·{" "}
                {completeness.isComplete ? "complete" : "incomplete"}
                {completeness.unmatchedMeasurementCount > 0
                  ? ` · ${completeness.unmatchedMeasurementCount} reading(s) match no parameter`
                  : ""}
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Parameter</th>
                      <th className="px-2 py-1.5 text-left font-medium">Frequency</th>
                      <th className="px-2 py-1.5 text-right font-medium">Expected</th>
                      <th className="px-2 py-1.5 text-right font-medium">Recorded</th>
                      <th className="px-2 py-1.5 text-right font-medium">Verified</th>
                      <th className="px-2 py-1.5 text-right font-medium">Missing</th>
                      <th className="px-2 py-1.5 text-right font-medium">Completeness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completeness.parameters.map((row) => (
                      <tr key={row.parameterId} className="border-t">
                        <td className="px-2 py-1">{row.parameterName}</td>
                        <td className="px-2 py-1">{humaniseEnum(row.frequency)}</td>
                        <td className="px-2 py-1 text-right font-mono">
                          {formatNumber(row.expected)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {formatNumber(row.recorded)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {formatNumber(row.verified)}
                        </td>
                        <td
                          className={`px-2 py-1 text-right font-mono ${row.missing > 0 ? "text-amber-600" : ""}`}
                        >
                          {formatNumber(row.missing)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {formatPercent(row.completeness * 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {completeness.unmeasuredParameterIds.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  No readings at all for: {completeness.unmeasuredParameterIds.join(", ")}
                </p>
              )}
            </TabsContent>

            <TabsContent value="parameters" className="space-y-1.5 pt-3">
              {parameters.map((parameter) => (
                <div
                  key={parameter.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
                >
                  <span className="font-medium">{parameter.name}</span>
                  <Badge variant="outline">{parameter.unit}</Badge>
                  <Badge variant="secondary">
                    {humaniseEnum(parameter.frequency ?? monitoringPlan.frequency)}
                  </Badge>
                  {parameter.alertOnBreach && <Badge variant="outline">alert on breach</Badge>}
                  {parameter.threshold !== null && parameter.threshold !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      threshold {formatNumber(parameter.threshold, 2)} {parameter.unit}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {parameter.methodology ?? "methodology not stated"}
                  </span>
                  <p className="w-full text-[11px] text-muted-foreground">
                    {parameter.description} · source{" "}
                    {parameter.emissionSourceId ?? "not associated"}
                  </p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="readings" className="pt-3">
              {measurements.length === 0 ? (
                <EmptyState title="No readings for this period" />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Measured at</th>
                        <th className="px-2 py-1.5 text-left font-medium">Parameter</th>
                        <th className="px-2 py-1.5 text-right font-medium">Value</th>
                        <th className="px-2 py-1.5 text-right font-medium">Uncertainty</th>
                        <th className="px-2 py-1.5 text-left font-medium">Verified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurements.slice(0, 100).map((measurement, index) => (
                        <tr key={measurement.id ?? index} className="border-t">
                          <td className="px-2 py-1 font-mono">
                            {formatDateTime(measurement.measuredAt)}
                          </td>
                          <td className="px-2 py-1">{measurement.parameter}</td>
                          <td className="px-2 py-1 text-right font-mono">
                            {formatNumber(measurement.value, 3)} {measurement.unit}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">
                            {measurement.uncertainty === null ||
                            measurement.uncertainty === undefined
                              ? "—"
                              : `±${formatPercent(measurement.uncertainty * 100)}`}
                          </td>
                          <td className="px-2 py-1">
                            {measurement.verifiedAt ? formatDate(measurement.verifiedAt) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="meter" className="pt-3">
              <ActionForm
                action={recordMeterReadingAction}
                submitLabel="Record reading"
                fields={[
                  {
                    name: "facilityId",
                    label: "Facility",
                    type: "select",
                    required: true,
                    options: facilities.map((facility) => ({
                      value: facility.id,
                      label: facility.name,
                    })),
                  },
                  { name: "meterId", label: "Meter number", required: true },
                  {
                    name: "meterType",
                    label: "Reading type",
                    required: true,
                    placeholder: "electricity, gas, water…",
                  },
                  { name: "readingDate", label: "Reading date", type: "date", required: true },
                  {
                    name: "previousReading",
                    label: "Previous reading",
                    type: "number",
                    step: "any",
                  },
                  {
                    name: "currentReading",
                    label: "Current reading",
                    type: "number",
                    step: "any",
                    required: true,
                    description: "Must be at least the previous reading.",
                  },
                  {
                    name: "consumption",
                    label: "Consumption",
                    type: "number",
                    step: "any",
                    required: true,
                  },
                  {
                    name: "unit",
                    label: "Unit",
                    type: "select",
                    required: true,
                    options: UNIT_REGISTRY.map((definition) => ({
                      value: definition.unit,
                      label: `${definition.unit} — ${definition.label}`,
                    })),
                  },
                  { name: "isEstimated", label: "Estimated", type: "checkbox" },
                ]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monitored sources</CardTitle>
          <CardDescription>
            Which parameters cover which source, and at what frequency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {coverage.covered.map((source) => (
            <div
              key={source.sourceId}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
            >
              <span className="font-medium">{source.sourceName}</span>
              <Badge variant="secondary">{scopeLabel(source.scope)}</Badge>
              <span className="text-xs text-muted-foreground">
                {source.parameterCount} parameter
                {source.parameterCount === 1 ? "" : "s"} ·{" "}
                {source.frequencies.map((frequency) => humaniseEnum(frequency)).join(", ")}
              </span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {source.parameterIds.join(", ")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
