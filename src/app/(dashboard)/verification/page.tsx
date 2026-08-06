/**
 * Verification module.
 *
 * Engagements, scopes, findings with the severity rollup and due-date triage,
 * evidence packages with SHA-256 digests, the materiality/opinion summary and the
 * audit-trail viewer.
 */

import { connection } from "next/server";
import { ClipboardCheck, FileCheck, Gauge, ShieldAlert } from "lucide-react";

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
import {
  assessMaterialityAction,
  recordFindingAction,
  scoreVerificationReadinessAction,
} from "@/lib/actions/verification";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import { listAuditTrail } from "@/lib/data/repositories/audit";
import { getInventory } from "@/lib/data/repositories/calculation";
import { listUsers } from "@/lib/data/repositories/security";
import {
  getEvidencePackage,
  getVerificationView,
  listVerificationEngagements,
} from "@/lib/data/repositories/verification";
import { ASSURANCE_LEVELS } from "@/lib/domain/verification/materiality";
import {
  CLOSED_FINDING_STATUSES,
  FINDING_SEVERITIES,
  OPEN_FINDING_STATUSES,
} from "@/lib/domain/verification/findings";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatEmissions,
  formatNumber,
  formatPercent,
  humaniseEnum,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n/server";

import { FindingForm } from "./_components/finding-form";
import { MaterialityPanel } from "./_components/materiality-panel";

const SEVERITY_TONE: Readonly<Record<string, string>> = {
  CRITICAL: "border-red-500/50 text-red-700 dark:text-red-300",
  MAJOR: "border-orange-500/50 text-orange-700 dark:text-orange-300",
  MINOR: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  OBSERVATION: "border-slate-400/50 text-slate-700 dark:text-slate-300",
};

const FINDING_TYPES = [
  "MISSTATEMENT",
  "NONCONFORMITY",
  "CONTROL_WEAKNESS",
  "DOCUMENTATION",
  "OBSERVATION",
] as const;

export default async function VerificationPage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const reportingYear = years[0] ?? new Date().getUTCFullYear();

  const [view, engagements, evidence, inventory, users, auditTrail] = await Promise.all([
    getVerificationView(organizationId),
    listVerificationEngagements(organizationId),
    getEvidencePackage(organizationId),
    getInventory(organizationId, reportingYear),
    listUsers(organizationId),
    listAuditTrail(organizationId, {}, { limit: 50 }),
  ]);

  if (!view) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={dict["verification.title"]}
          description={dict["verification.desc"]}
        />
        <EmptyState
          title={dict["verification.empty.noEngagement"]}
          description={dict["verification.empty.noEngagementDesc"]}
        />
      </div>
    );
  }

  const { engagement, scopes, findings, rollup, triage, misstatements, readiness } = view;
  const quantified = findings.filter((finding) => finding.misstatementAmount !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["verification.title"]}
        description={dict["verification.desc"]}
        meta={[
          { label: dict["verification.meta.engagement"], value: engagement.name },
          { label: dict["verification.meta.verifier"], value: engagement.verifierOrg ?? "—" },
          { label: dict["verification.meta.assurance"], value: engagement.level ?? "—" },
          { label: dict["verification.meta.status"], value: humaniseEnum(engagement.status) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={dict["verification.kpi.openFindings"]}
          value={formatNumber(rollup.open)}
          icon={ShieldAlert}
          description={`${rollup.overdue} overdue · highest open severity ${rollup.highestOpenSeverity ?? "none"}`}
          source="severityRollup()"
        />
        <KpiCard
          title={dict["verification.kpi.closureRate"]}
          value={formatPercent(rollup.closureRate * 100, 0)}
          icon={ClipboardCheck}
          description={`${rollup.closed} of ${rollup.total} findings closed`}
          source="severityRollup()"
          goodDirection="up"
        />
        <KpiCard
          title={dict["verification.kpi.assuranceOpinion"]}
          value={misstatements.opinionType}
          icon={FileCheck}
          description={`net misstatement ${formatEmissions(misstatements.netMisstatement)} ${misstatements.unit} vs threshold ${formatEmissions(misstatements.thresholdQuantity)} ${misstatements.unit}`}
          source="aggregateMisstatements()"
        />
        <KpiCard
          title={dict["verification.kpi.auditReadiness"]}
          value={formatNumber(readiness.score, 0)}
          unit="/ 100"
          icon={Gauge}
          description={readiness.level}
          source="readinessScore()"
          goodDirection="up"
        />
      </div>

      {readiness.blockers.length > 0 && (
        <Card className="border-red-500/40">
          <CardHeader>
            <CardTitle className="text-base">{dict["verification.card.blockers"]}</CardTitle>
            <CardDescription>
              {dict["verification.card.blockersDesc"]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc text-xs">
              {readiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{dict["verification.card.engagementsAndScope"]}</CardTitle>
          <CardDescription>
            {dict["verification.card.engagementsAndScopeDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            {engagements.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
              >
                <span className="font-medium">{row.name}</span>
                <Badge variant={row.id === engagement.id ? "default" : "outline"}>
                  {humaniseEnum(row.status)}
                </Badge>
                {row.level && <Badge variant="outline">{row.level}</Badge>}
                {row.framework && <Badge variant="outline">{row.framework}</Badge>}
                {row.opinionType && <Badge variant="secondary">{row.opinionType}</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDate(row.startDate)} → {formatDate(row.endDate)} ·{" "}
                  {row.verifierName ?? "verifier not named"}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            {scopes.map((scope) => (
              <div key={scope.id} className="rounded-md border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{scope.category}</span>
                  <Badge variant="outline">{humaniseEnum(scope.status)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    materiality {formatPercent(scope.materialityThreshold)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{scope.description}</p>
                {scope.boundaries && (
                  <p className="text-[11px] text-muted-foreground">
                    Boundaries: {scope.boundaries}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dict["verification.card.findings"]}</CardTitle>
          <CardDescription>
            {quantified.length} of {findings.length} findings carry a quantified misstatement, and
            only those feed the opinion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="triage">
            <TabsList className="flex-wrap" variant="line">
              <TabsTrigger value="triage">{dict["verification.tab.triage"]} ({triage.openCount})</TabsTrigger>
              <TabsTrigger value="all">{dict["verification.tab.allFindings"]} ({findings.length})</TabsTrigger>
              <TabsTrigger value="rollup">{dict["verification.tab.severityRollup"]}</TabsTrigger>
              <TabsTrigger value="new">{dict["verification.tab.recordFinding"]}</TabsTrigger>
              <TabsTrigger value="opinion">{dict["verification.tab.materiality"]}</TabsTrigger>
            </TabsList>

            <TabsContent value="triage" className="space-y-3 pt-3">
              {(
                [
                  [dict["verification.triage.overdue"], triage.overdue],
                  [dict["verification.triage.dueSoon"], triage.dueSoon],
                  [dict["verification.triage.upcoming"], triage.upcoming],
                  [dict["verification.triage.noDueDate"], triage.undated],
                ] as const
              ).map(([label, bucket]) => (
                <div key={label}>
                  <p className="mb-1 text-sm font-medium">
                    {label} ({bucket.length})
                  </p>
                  {bucket.length === 0 ? (
                    <p className="text-xs text-muted-foreground">none</p>
                  ) : (
                    <ul className="space-y-1">
                      {bucket.map((finding) => (
                        <li
                          key={finding.id}
                          className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs"
                        >
                          <Badge
                            variant="outline"
                            className={SEVERITY_TONE[finding.severity] ?? ""}
                          >
                            {finding.severity}
                          </Badge>
                          <span className="font-medium">{finding.title}</span>
                          <Badge variant="outline">{humaniseEnum(finding.status)}</Badge>
                          <span className="ml-auto text-muted-foreground">
                            due {formatDate(finding.dueDate)}
                            {finding.daysUntilDue !== null
                              ? ` (${finding.daysUntilDue} days)`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="all" className="space-y-2 pt-3">
              {findings.map((finding) => (
                <div key={finding.id} className="rounded-md border p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={SEVERITY_TONE[finding.severity] ?? ""}>
                      {finding.severity}
                    </Badge>
                    <span className="text-sm font-medium">{finding.title}</span>
                    <Badge variant="outline">{humaniseEnum(finding.type)}</Badge>
                    <Badge variant="secondary">{finding.status}</Badge>
                    {finding.misstatementAmount !== null && (
                      <Badge variant="outline" className="font-mono">
                        {formatEmissions(finding.misstatementAmount)} {misstatements.unit}
                      </Badge>
                    )}
                    {finding.estimatedFinancialImpact !== null && (
                      <Badge
                        variant="outline"
                        className="font-mono"
                        title={dict["verification.badge.financialImpactInfo"]}
                      >
                        {formatCurrency(
                          finding.estimatedFinancialImpact,
                          finding.impactCurrency ?? "USD",
                        )}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      due {formatDate(finding.dueDate)}
                      {finding.resolvedAt ? ` · resolved ${formatDate(finding.resolvedAt)}` : ""}
                    </span>
                  </div>
                  {finding.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{finding.description}</p>
                  )}
                  {finding.recommendation && (
                    <p className="text-[11px] text-muted-foreground">
                      Corrective action: {finding.recommendation}
                    </p>
                  )}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="rollup" className="pt-3">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium">{dict["verification.table.severity"]}</th>
                    <th className="text-right font-medium">{dict["verification.table.total"]}</th>
                    <th className="text-right font-medium">{dict["verification.table.open"]}</th>
                    <th className="text-right font-medium">{dict["verification.table.closed"]}</th>
                    <th className="text-right font-medium">{dict["verification.table.overdue"]}</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.bySeverity.map((bucket) => (
                    <tr key={bucket.severity} className="border-t">
                      <td className="py-1">{bucket.severity}</td>
                      <td className="py-1 text-right font-mono">{bucket.total}</td>
                      <td className="py-1 text-right font-mono">{bucket.open}</td>
                      <td className="py-1 text-right font-mono">{bucket.closed}</td>
                      <td className="py-1 text-right font-mono">{bucket.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Open weight {formatNumber(rollup.openWeight)} — CRITICAL findings carry 40,
                MAJOR 15, MINOR 5, OBSERVATION 1.
              </p>
            </TabsContent>

            <TabsContent value="new" className="pt-3">
              <FindingForm
                engagementId={engagement.id}
                findingTypes={FINDING_TYPES.map((type) => ({
                  value: type,
                  label: humaniseEnum(type),
                }))}
                severities={FINDING_SEVERITIES.map((severity) => ({
                  value: severity,
                  label: severity,
                }))}
                statuses={[...OPEN_FINDING_STATUSES, ...CLOSED_FINDING_STATUSES].map(
                  (status) => ({ value: status, label: humaniseEnum(status) }),
                )}
                users={users.map((user) => ({ value: user.id, label: user.name }))}
                recordFinding={recordFindingAction}
              />
            </TabsContent>

            <TabsContent value="opinion" className="space-y-3 pt-3">
              <div className="rounded-md border p-2.5 text-xs">
                <p className="text-sm font-medium">
                  Current opinion: {misstatements.opinionType}
                </p>
                <ul className="mt-1 list-inside list-disc">
                  {misstatements.rationale.map((line, index) => (
                    <li key={`${index}-${line}`}>{line}</li>
                  ))}
                </ul>
                {misstatements.affectedAreas.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    Affected areas: {misstatements.affectedAreas.join(", ")}
                  </p>
                )}
              </div>
              <MaterialityPanel
                engagementId={engagement.id}
                totalEmissions={inventory.totals.totalEmissions}
                unit={inventory.totals.unit}
                assuranceLevels={ASSURANCE_LEVELS.map((level) => ({
                  value: level,
                  label: humaniseEnum(level),
                }))}
                defaultAssuranceLevel={engagement.level ?? "LIMITED"}
                assessMateriality={assessMaterialityAction}
                scoreReadiness={scoreVerificationReadinessAction}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dict["verification.card.evidencePackage"]}</CardTitle>
            <CardDescription>
              {evidence
                ? `${evidence.name} — SHA-256 digest ${evidence.hash.slice(0, 16)}…`
                : "No evidence package for this engagement."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {evidence ? (
              <>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="outline">{evidence.fileCount} files</Badge>
                  <Badge variant="outline">
                    {formatNumber(evidence.totalSize ?? 0)} bytes
                  </Badge>
                  <Badge variant="outline">{evidence.type}</Badge>
                  <Badge variant="outline">{evidence.status}</Badge>
                </div>
                <ul className="space-y-1">
                  {evidence.manifest.items.map((item) => (
                    <li key={item.name} className="rounded-md border p-2 text-xs">
                      <p className="font-medium">{item.name}</p>
                      <p className="font-mono break-all text-[11px] text-muted-foreground">
                        {item.hash}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  {`Package hash over ${evidence.manifest.fileCount} id-sorted per-item digests; any single-file change changes the package hash.`}
                </p>
              </>
            ) : (
              <EmptyState title={dict["verification.empty.noEvidencePackage"]} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{dict["verification.card.auditTrail"]}</CardTitle>
            <CardDescription>
              {dict["verification.card.auditTrailDesc"]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {auditTrail.length === 0 ? (
              <EmptyState
                title={dict["verification.empty.noAuditEntries"]}
                description={dict["verification.empty.noAuditEntriesDesc"]}
              />
            ) : (
              <ul className="space-y-1">
                {auditTrail.map((entry) => (
                  <li key={entry.id} className="rounded-md border p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{entry.action}</Badge>
                      <span className="font-medium">{entry.entityType}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {entry.entityId}
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        {formatDateTime(entry.timestamp)}
                      </span>
                    </div>
                    {entry.changes && (
                      <p className="mt-1 font-mono break-all text-[11px] text-muted-foreground">
                        {JSON.stringify(entry.changes)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
