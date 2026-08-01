/**
 * Emission-factor library.
 *
 * Reads the versioned factor set, its sources and its versions from the repository,
 * and exposes the two read-only actions that make the library auditable: the
 * `resolveFactor()` explainer and the unit converter. Both are `readOnly`, so they
 * work in demo mode.
 */

import { connection } from "next/server";
import { BookOpen, CalendarClock, Library, Ruler } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import {
  convertUnitAction,
  explainFactorResolutionAction,
} from "@/lib/actions/emission-factor";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { GHG_SCOPES } from "@/lib/core/enums";
import {
  listEmissionFactors,
  listFactorSources,
  listFactorVersions,
} from "@/lib/data/repositories/emission-factor";
import { formatDate, formatNumber, scopeLabel } from "@/lib/format";
import { SCOPE3_CATEGORY_DEFINITIONS } from "@/lib/reference/scope3-categories";
import { UNIT_REGISTRY } from "@/lib/reference/units";
import { EMISSION_FACTOR_UNITS } from "@/lib/core/enums";
import { getDictionary } from "@/lib/i18n/server";

import { FactorTable, type FactorTableRow } from "./_components/factor-table";
import { ResolutionExplainer } from "./_components/resolution-explainer";
import { UnitConverter } from "./_components/unit-converter";

export default async function EmissionFactorsPage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();

  const [factors, sources, versions] = await Promise.all([
    listEmissionFactors({ organizationId, includeInactive: true }),
    listFactorSources(),
    listFactorVersions(),
  ]);

  const rows: FactorTableRow[] = factors.map((factor) => ({
    id: factor.id,
    name: factor.name,
    value: factor.value,
    unit: factor.unit,
    gasType: factor.gasType ?? null,
    scope: factor.scope ?? null,
    scope3Category: factor.scope3Category ?? null,
    region: factor.region ?? null,
    country: factor.country ?? null,
    sector: factor.sector ?? null,
    validFrom: factor.validFrom ? factor.validFrom.toISOString() : null,
    validTo: factor.validTo ? factor.validTo.toISOString() : null,
    isActive: factor.isActive !== false,
    uncertainty: factor.uncertainty ?? null,
    dataQuality: factor.dataQuality ?? null,
    sourceName: factor.sourceName,
    versionLabel: factor.versionLabel,
    organizationSpecific: factor.organizationId !== null && factor.organizationId !== undefined,
  }));

  const active = rows.filter((row) => row.isActive);
  const sectors = [...new Set(rows.map((row) => row.sector).filter(Boolean))] as string[];
  const openEnded = active.filter((row) => row.validTo === null);
  const versionsBySource = new Map<string, typeof versions>();
  for (const version of versions) {
    const bucket = versionsBySource.get(version.sourceId);
    if (bucket) versionsBySource.set(version.sourceId, [...bucket, version]);
    else versionsBySource.set(version.sourceId, [version]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["factors.title"]}
        description={dict["factors.desc"]}
        meta={[
          { label: dict["factors.meta.factors"], value: formatNumber(rows.length) },
          { label: dict["factors.meta.sources"], value: formatNumber(sources.length) },
          { label: dict["factors.meta.versions"], value: formatNumber(versions.length) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Active factors"
          value={formatNumber(active.length)}
          icon={Library}
          description={`${rows.length - active.length} superseded`}
          source="listEmissionFactors()"
        />
        <KpiCard
          title="Published sources"
          value={formatNumber(sources.length)}
          icon={BookOpen}
          description={sources.map((source) => source.publisher).filter(Boolean).join(", ")}
          source="EmissionFactorSource"
        />
        <KpiCard
          title="Open-ended validity"
          value={formatNumber(openEnded.length)}
          icon={CalendarClock}
          description="no validTo — will keep applying until superseded"
          source="EmissionFactor.validTo"
        />
        <KpiCard
          title="Organization-specific"
          value={formatNumber(rows.filter((row) => row.organizationSpecific).length)}
          icon={Ruler}
          description="rank above published factors in resolveFactor()"
          source="EmissionFactor.organizationId"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Factor library</CardTitle>
          <CardDescription>
            Filter by scope, source and validity date. Every factor carries its publisher and
            version, because an inventory figure is only defensible if its factor is citable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FactorTable
            rows={rows}
            scopes={GHG_SCOPES.map((scope) => ({ value: scope, label: scopeLabel(scope) }))}
            sources={sources.map((source) => ({ value: source.name, label: source.name }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Which factor applies?</CardTitle>
            <CardDescription>
              Runs `resolveFactor()` against the live candidate set and returns its ordered
              rationale, the runners-up and every rejected candidate with a reason.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResolutionExplainer
              organizationId={organizationId}
              defaultDate={new Date().toISOString().slice(0, 10)}
              scopes={GHG_SCOPES.map((scope) => ({ value: scope, label: scopeLabel(scope) }))}
              scope3Categories={SCOPE3_CATEGORY_DEFINITIONS.map((definition) => ({
                value: definition.category,
                label: `${definition.number}. ${definition.nameEn}`,
              }))}
              sectors={sectors.map((sector) => ({ value: sector, label: sector }))}
              units={EMISSION_FACTOR_UNITS.map((unit) => ({ value: unit, label: unit }))}
              explainResolution={explainFactorResolutionAction}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unit converter</CardTitle>
            <CardDescription>
              The engines&apos; own converter: direct factor, inverse factor, or a single hop
              through the dimension&apos;s canonical unit. Incompatible dimensions are rejected
              rather than silently coerced.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UnitConverter
              units={UNIT_REGISTRY.map((definition) => ({
                value: definition.unit,
                label: `${definition.unit} — ${definition.label} (${definition.dimension})`,
              }))}
              convertUnit={convertUnitAction}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sources and versions</CardTitle>
          <CardDescription>
            Each factor set is version-pinned, so a recalculation with a newer release is an
            explicit act rather than a silent drift.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={sources[0]?.id ?? "none"}>
            <TabsList className="flex-wrap" variant="line">
              {sources.map((source) => (
                <TabsTrigger key={source.id} value={source.id}>
                  {source.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {sources.map((source) => (
              <TabsContent key={source.id} value={source.id} className="space-y-3 pt-3">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{source.name}</p>
                  <p className="text-xs text-muted-foreground">{source.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Publisher: {source.publisher} · Methodology: {source.methodology} · Last
                    updated {formatDate(source.lastUpdated)}
                  </p>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline"
                    >
                      {source.url}
                    </a>
                  )}
                </div>
                <div className="space-y-1.5">
                  {(versionsBySource.get(source.id) ?? []).map((version) => (
                    <div key={version.id} className="rounded-md border p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">v{version.version}</span>
                        {version.isLatest && <Badge variant="secondary">latest</Badge>}
                        <span className="text-xs text-muted-foreground">
                          released {formatDate(version.releaseDate)} ·{" "}
                          {rows.filter((row) => row.versionLabel === version.version).length}{" "}
                          factors
                        </span>
                      </div>
                      {version.description && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {version.description}
                        </p>
                      )}
                      {version.changelog && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Changelog: {version.changelog}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
