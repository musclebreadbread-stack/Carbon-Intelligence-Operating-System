/**
 * ESG disclosure module.
 *
 * Framework cards show the *real* completeness from `completeness()` over the
 * auto-populated numeric datapoints plus the authored narrative, so a percentage
 * here is always the truth about the current inventory rather than a stored figure
 * that has drifted.
 */

import { connection } from "next/server";
import { FileText, ListChecks, Percent, Send } from "lucide-react";

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
import {
  generateDisclosureReportAction,
  saveDisclosureResponseAction,
} from "@/lib/actions/disclosure";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { DISCLOSURE_STATUSES } from "@/lib/core/enums";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import {
  getAssembledReport,
  isMappableFramework,
  listDisclosureFrameworks,
  listDisclosureReports,
  listFrameworkCompleteness,
} from "@/lib/data/repositories/disclosure";
import { requirementsFor } from "@/lib/domain/disclosure/requirements";
import {
  formatDate,
  formatNumber,
  formatPercent,
  humaniseEnum,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n/server";

export default async function EsgDisclosurePage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const reportingYear = years[0] ?? new Date().getUTCFullYear();

  const [frameworks, views, reports] = await Promise.all([
    listDisclosureFrameworks(),
    listFrameworkCompleteness(organizationId, reportingYear),
    listDisclosureReports(organizationId),
  ]);

  const primary = views[0] ?? null;
  const assembled = primary
    ? await getAssembledReport(organizationId, primary.framework, reportingYear)
    : null;

  const unmappable = frameworks.filter((framework) => !isMappableFramework(framework.code));
  const overallAnswered = views.reduce((total, view) => total + view.completeness.answered, 0);
  const overallTotal = views.reduce((total, view) => total + view.completeness.total, 0);
  const autoPopulated = views.reduce(
    (total, view) => total + view.mapping.populatedCodes.length,
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["disclosure.title"]}
        description="Framework mapping, auto-populated numeric datapoints, response editor and report generation."
        meta={[
          { label: "Reporting year", value: String(reportingYear) },
          { label: "Mapped frameworks", value: formatNumber(views.length) },
          { label: "Reports", value: formatNumber(reports.length) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Overall completeness"
          value={formatPercent(overallTotal === 0 ? 0 : (overallAnswered / overallTotal) * 100)}
          icon={Percent}
          description={`${overallAnswered} of ${overallTotal} datapoints across every mapped framework`}
          source="completeness()"
          goodDirection="up"
        />
        <KpiCard
          title="Auto-populated"
          value={formatNumber(autoPopulated)}
          icon={ListChecks}
          description="numeric datapoints filled from the calculated inventory"
          source="mapInventoryToRequirements()"
          goodDirection="up"
        />
        <KpiCard
          title="Frameworks mapped"
          value={`${views.length} / ${frameworks.length}`}
          icon={FileText}
          description={
            unmappable.length > 0
              ? `${unmappable.map((framework) => framework.code).join(", ")} have no requirement catalogue yet`
              : "every framework has a catalogue"
          }
          source="requirementsFor()"
        />
        <KpiCard
          title="Reports"
          value={formatNumber(reports.length)}
          icon={Send}
          description={`${reports.filter((report) => report.submittedAt !== null).length} submitted`}
          source="listDisclosureReports()"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {views.map((view) => (
          <Card key={view.framework} data-testid={`framework-card-${view.framework}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{view.framework}</CardTitle>
                <Badge variant={view.completeness.isComplete ? "secondary" : "outline"}>
                  {view.completeness.isComplete ? "complete" : "in progress"}
                </Badge>
              </div>
              <CardDescription>
                {view.completeness.answered} of {view.completeness.total} datapoints ·{" "}
                {view.completeness.mandatoryAnswered} of {view.completeness.mandatoryTotal}{" "}
                mandatory
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Overall</span>
                  <span className="font-mono">{formatPercent(view.completeness.percent)}</span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, view.completeness.percent)}%` }}
                  />
                </span>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Mandatory</span>
                  <span className="font-mono">
                    {formatPercent(view.completeness.mandatoryPercent)}
                  </span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(100, view.completeness.mandatoryPercent)}%` }}
                  />
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {view.mapping.populatedCodes.length} auto-populated ·{" "}
                {view.mapping.narrativeCodes.length} narrative ·{" "}
                {view.mapping.unavailableCodes.length} awaiting an input
              </p>
              {view.completeness.unansweredMandatory.length > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Mandatory gaps:{" "}
                  {view.completeness.unansweredMandatory
                    .slice(0, 3)
                    .map((gap) => gap.code)
                    .join(", ")}
                  {view.completeness.unansweredMandatory.length > 3
                    ? ` +${view.completeness.unansweredMandatory.length - 3} more`
                    : ""}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {primary && (
        <Card>
          <CardHeader>
            <CardTitle>{primary.framework} requirements</CardTitle>
            <CardDescription>
              Auto-populated values are marked; the rest need authoring. Saving a response goes
              through `saveDisclosureResponseAction`, which validates the requirement code
              against the catalogue so a typo cannot create an orphan row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="requirements">
              <TabsList className="flex-wrap" variant="line">
                <TabsTrigger value="requirements">Requirements</TabsTrigger>
                <TabsTrigger value="categories">By category</TabsTrigger>
                <TabsTrigger value="editor">Response editor</TabsTrigger>
                <TabsTrigger value="report">Assembled report</TabsTrigger>
                <TabsTrigger value="generate">Generate</TabsTrigger>
              </TabsList>

              <TabsContent value="requirements" className="pt-3">
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Code</th>
                        <th className="px-2 py-1.5 text-left font-medium">Requirement</th>
                        <th className="px-2 py-1.5 text-left font-medium">Category</th>
                        <th className="px-2 py-1.5 text-left font-medium">Value</th>
                        <th className="px-2 py-1.5 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requirementsFor(primary.framework).map((requirement) => {
                        const response = primary.mapping.responses.find(
                          (row) => row.requirementCode === requirement.code,
                        );
                        return (
                          <tr key={requirement.code} className="border-t">
                            <td className="px-2 py-1 font-mono">{requirement.code}</td>
                            <td className="px-2 py-1">
                              <p>{requirement.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {requirement.nameKo}
                              </p>
                            </td>
                            <td className="px-2 py-1">{requirement.category}</td>
                            <td className="px-2 py-1 font-mono">
                              {response?.numericValue !== null &&
                              response?.numericValue !== undefined
                                ? `${formatNumber(response.numericValue, 2)} ${response.unit ?? ""}`
                                : (response?.value ?? "—")}
                            </td>
                            <td className="px-2 py-1">
                              <div className="flex flex-wrap gap-1">
                                {requirement.isMandatory && (
                                  <Badge variant="outline">mandatory</Badge>
                                )}
                                {response?.isAutoPopulated && (
                                  <Badge variant="secondary">auto</Badge>
                                )}
                                <Badge variant="outline">
                                  {humaniseEnum(response?.status ?? "NOT_STARTED")}
                                </Badge>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="categories" className="pt-3">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium">Category</th>
                      <th className="text-right font-medium">Answered</th>
                      <th className="text-right font-medium">Total</th>
                      <th className="text-right font-medium">Overall</th>
                      <th className="text-right font-medium">Mandatory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {primary.completeness.byCategory.map((category) => (
                      <tr key={category.category} className="border-t">
                        <td className="py-1">{category.category}</td>
                        <td className="py-1 text-right font-mono">{category.answered}</td>
                        <td className="py-1 text-right font-mono">{category.total}</td>
                        <td className="py-1 text-right font-mono">
                          {formatPercent(category.percent)}
                        </td>
                        <td className="py-1 text-right font-mono">
                          {formatPercent(category.mandatoryPercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabsContent>

              <TabsContent value="editor" className="pt-3">
                <ActionForm
                  action={saveDisclosureResponseAction}
                  submitLabel="Save response"
                  fields={[
                    {
                      name: "framework",
                      label: "Framework",
                      type: "select",
                      required: true,
                      defaultValue: primary.framework,
                      options: views.map((view) => ({
                        value: view.framework,
                        label: view.framework,
                      })),
                    },
                    {
                      name: "requirementCode",
                      label: "Requirement",
                      type: "select",
                      required: true,
                      options: requirementsFor(primary.framework).map((requirement) => ({
                        value: requirement.code,
                        label: `${requirement.code} — ${requirement.name}`,
                      })),
                    },
                    {
                      name: "numericValue",
                      label: "Numeric value",
                      type: "number",
                      step: "any",
                      description: "Leave blank for a narrative answer.",
                    },
                    {
                      name: "status",
                      label: "Status",
                      type: "select",
                      defaultValue: "IN_PROGRESS",
                      options: DISCLOSURE_STATUSES.map((status) => ({
                        value: status,
                        label: humaniseEnum(status),
                      })),
                    },
                    { name: "value", label: "Narrative answer", type: "textarea", wide: true },
                    { name: "notes", label: "Notes", type: "textarea", wide: true },
                    { name: "evidenceUrl", label: "Evidence URL", type: "url", wide: true },
                  ]}
                />
              </TabsContent>

              <TabsContent value="report" className="space-y-2 pt-3">
                {assembled ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {assembled.name} — {assembled.sections.length} sections,{" "}
                      {formatPercent(assembled.completeness.percent)} complete
                    </p>
                    {assembled.sections.map((section) => (
                      <div key={section.code} className="rounded-md border p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{section.title}</span>
                          <Badge variant="outline">{section.code}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {section.requirements.length} datapoint
                            {section.requirements.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {section.requirements.map((datapoint) => (
                            <li key={datapoint.code} className="flex gap-2 text-[11px]">
                              <span className="w-24 shrink-0 font-mono">{datapoint.code}</span>
                              <span className="flex-1 truncate">{datapoint.name}</span>
                              <span className="font-mono">
                                {datapoint.numericValue !== null
                                  ? `${formatNumber(datapoint.numericValue, 2)} ${datapoint.unit ?? ""}`
                                  : (datapoint.value ?? "—")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </>
                ) : (
                  <EmptyState title="No assembled report" />
                )}
              </TabsContent>

              <TabsContent value="generate" className="pt-3">
                <ActionForm
                  action={generateDisclosureReportAction}
                  hidden={{ organizationId }}
                  submitLabel="Generate report"
                  pendingLabel="Generating…"
                  fields={[
                    {
                      name: "framework",
                      label: "Framework",
                      type: "select",
                      required: true,
                      defaultValue: primary.framework,
                      options: views.map((view) => ({
                        value: view.framework,
                        label: view.framework,
                      })),
                    },
                    {
                      name: "reportingYear",
                      label: "Reporting year",
                      type: "select",
                      required: true,
                      defaultValue: String(reportingYear),
                      options: (years.length > 0 ? years : [reportingYear]).map((year) => ({
                        value: String(year),
                        label: String(year),
                      })),
                    },
                    {
                      name: "revenue",
                      label: "Revenue",
                      type: "number",
                      step: "any",
                      description: "Needed for intensity datapoints.",
                    },
                    { name: "revenueUnit", label: "Revenue unit", placeholder: "MUSD" },
                    {
                      name: "energyConsumption",
                      label: "Energy consumption (MWh)",
                      type: "number",
                      step: "any",
                    },
                    {
                      name: "renewableShare",
                      label: "Renewable share (0–1)",
                      type: "number",
                      step: "any",
                      min: 0,
                      max: 1,
                    },
                    { name: "baseYear", label: "Base year", type: "number" },
                    {
                      name: "baseYearEmissions",
                      label: "Base-year emissions",
                      type: "number",
                      step: "any",
                    },
                    {
                      name: "format",
                      label: "Format",
                      type: "select",
                      defaultValue: "pdf",
                      options: ["pdf", "xlsx", "json", "html"].map((format) => ({
                        value: format,
                        label: format,
                      })),
                    },
                  ]}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Reports and submission deadlines</CardTitle>
          <CardDescription>
            `DisclosureReport` rows with their due dates; submission is the user&apos;s own
            filing action with the framework body.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {reports.length === 0 ? (
            <EmptyState title="No reports yet" />
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
              >
                <span className="font-medium">{report.name}</span>
                <Badge variant="secondary">{report.framework}</Badge>
                <Badge variant="outline">{humaniseEnum(report.status)}</Badge>
                <span className="text-xs text-muted-foreground">
                  {report.reportingYear} · due {formatDate(report.dueDate)}
                  {report.submittedAt ? ` · submitted ${formatDate(report.submittedAt)}` : ""}
                </span>
                {report.notes && (
                  <p className="w-full text-xs text-muted-foreground">{report.notes}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {unmappable.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Frameworks without a requirement catalogue</CardTitle>
            <CardDescription>
              These are declared in the schema but have no mapped datapoints yet, so they are
              excluded from the completeness figures rather than reported as 0%.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {unmappable.map((framework) => (
              <Badge key={framework.code} variant="outline">
                {framework.code} — {framework.name}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
