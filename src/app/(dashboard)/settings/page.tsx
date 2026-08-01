/**
 * Settings module.
 *
 * Organisation profile, fiscal year, base currency, GWP version, consolidation
 * approach, and the honest configuration status of every external dependency the
 * code actually reads. The environment panel is the page a first-time operator
 * lands on, so it names each variable, says what degrades without it, and points at
 * the Korean setup guide.
 */

import Link from "next/link";
import { connection } from "next/server";
import {
  Building2,
  Database,
  KeyRound,
  Map as MapIcon,
  Server,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { ActionForm } from "@/components/shared/form/action-form";
import { updateOrganizationAction } from "@/lib/actions/organization";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { describeLlmMode, isLlmConfigured } from "@/lib/ai/llm/factory";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { GWP_VERSIONS } from "@/lib/core/enums";
import { CONSOLIDATION_APPROACHES } from "@/lib/domain/emissions/aggregate";
import { getDataMode, getFallbackReason, isDbConfigured } from "@/lib/data/db";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import { getInventory } from "@/lib/data/repositories/calculation";
import { getOrganization } from "@/lib/data/repositories/organization";
import { formatEmissions, formatNumber, humaniseEnum } from "@/lib/format";
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";
import { getDictionary } from "@/lib/i18n/server";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1), label }));

/** Every variable the code reads, with the exact consequence of leaving it unset. */
const ENVIRONMENT: readonly {
  readonly name: string;
  readonly icon: React.ElementType;
  readonly configured: () => boolean;
  readonly required: boolean;
  readonly degradation: string;
}[] = [
  {
    name: "DATABASE_URL",
    icon: Database,
    configured: () => isDbConfigured(),
    required: true,
    degradation:
      "Reads fall back to the bundled fixture dataset — still computed by the real engines — and every mutation returns DEMO_MODE instead of persisting.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    icon: KeyRound,
    configured: () => isSupabaseConfigured(),
    required: true,
    degradation:
      "No identity provider: a demo administrator session is used, the sign-in and registration pages report the misconfiguration, and OAuth is unavailable.",
  },
  {
    name: "OPENAI_API_KEY",
    icon: Sparkles,
    configured: () => isLlmConfigured(),
    required: false,
    degradation:
      "Narrative text is generated deterministically from the calculation traces. Every numeric result — anomalies, forecasts, confidence — is unaffected.",
  },
  {
    name: "MAPBOX_ACCESS_TOKEN",
    icon: MapIcon,
    configured: () => (process.env.MAPBOX_ACCESS_TOKEN ?? "").trim().length > 0,
    required: false,
    degradation:
      "The organisation page shows a facility coordinate list instead of an interactive map.",
  },
  {
    name: "FIELD_ENCRYPTION_KEY",
    icon: Server,
    configured: () => (process.env.FIELD_ENCRYPTION_KEY ?? "").trim().length > 0,
    required: false,
    degradation:
      "Registering a data source with credentials fails: AES-256-GCM field encryption refuses to run without a key rather than storing plaintext.",
  },
  {
    name: "REDIS_URL",
    icon: Server,
    configured: () => (process.env.REDIS_URL ?? "").trim().length > 0,
    required: false,
    degradation:
      "Rate limiting stays in-process, so each server instance keeps its own token buckets.",
  },
];

export default async function SettingsPage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const reportingYear = years[0] ?? new Date().getUTCFullYear();

  const [organization, inventory] = await Promise.all([
    getOrganization(organizationId),
    getInventory(organizationId, reportingYear),
  ]);

  const llm = describeLlmMode();
  const dataMode = getDataMode();
  const configured = ENVIRONMENT.filter((entry) => entry.configured()).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["settings.title"]}
        description={dict["settings.desc"]}
        meta={[
          { label: dict["settings.meta.dataMode"], value: dataMode },
          { label: dict["settings.meta.gwp"], value: inventory.gwpVersion },
          { label: dict["settings.meta.consolidation"], value: humaniseEnum(inventory.consolidationApproach) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Dependencies configured"
          value={`${configured} / ${ENVIRONMENT.length}`}
          icon={SettingsIcon}
          description={
            dataMode === "demo"
              ? "running in demo mode — figures computed, nothing persisted"
              : "running against a live database"
          }
          source="process.env"
          goodDirection="up"
        />
        <KpiCard
          title="Fiscal year starts"
          value={MONTHS[(organization?.fiscalYearStart ?? 1) - 1]?.label ?? "January"}
          icon={Building2}
          description="drives every reporting-period boundary"
          source="Organization.fiscalYearStart"
        />
        <KpiCard
          title="Base currency"
          value={organization?.baseCurrency ?? "USD"}
          icon={Building2}
          description="used by MACC, investment appraisal and carbon pricing"
          source="Organization.baseCurrency"
        />
        <KpiCard
          title={`${reportingYear} inventory`}
          value={formatEmissions(inventory.totals.totalEmissions)}
          unit={inventory.totals.unit}
          icon={Database}
          description={`${formatNumber(inventory.totals.resultCount)} emission results`}
          source="buildInventory()"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Environment configuration</CardTitle>
          <CardDescription>
            Each variable is checked with the same predicate the runtime uses, so this panel
            cannot disagree with the application&apos;s behaviour. Nothing here reveals a value —
            only whether one is present and usable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ENVIRONMENT.map((entry) => {
            const Icon = entry.icon;
            const ok = entry.configured();
            return (
              <div key={entry.name} className="flex gap-3 rounded-lg border p-2.5">
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${ok ? "text-emerald-600" : "text-amber-600"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-sm font-medium break-all">{entry.name}</code>
                    <Badge variant={ok ? "secondary" : "outline"}>
                      {ok ? "configured" : "not configured"}
                    </Badge>
                    {entry.required && !ok && <Badge variant="destructive">required</Badge>}
                  </div>
                  {!ok && (
                    <p className="mt-1 text-xs text-muted-foreground">{entry.degradation}</p>
                  )}
                </div>
              </div>
            );
          })}
          {dataMode === "demo" && (
            <p className="text-xs text-muted-foreground">
              Data layer fallback reason:{" "}
              <span className="font-mono">{getFallbackReason() ?? "unknown"}</span>. The
              provisioning steps for every variable above are in{" "}
              <code>{SETUP_GUIDE_PATH}</code>.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Narrative generation: {llm.label} — {llm.labelKo}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organisation profile and reporting conventions</CardTitle>
          <CardDescription>
            The fiscal year, base currency and reporting year set here are read by every module;
            changing them changes period boundaries and intensity denominators everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={updateOrganizationAction}
            hidden={{ organizationId }}
            submitLabel="Save settings"
            pendingLabel="Saving…"
            fields={[
              { name: "name", label: "Name", required: true, defaultValue: organization?.name ?? "" },
              {
                name: "legalName",
                label: "Legal name",
                defaultValue: organization?.legalName ?? "",
              },
              { name: "industry", label: "Industry", defaultValue: organization?.industry ?? "" },
              { name: "sector", label: "Sector", defaultValue: organization?.sector ?? "" },
              {
                name: "country",
                label: "Country (ISO-2)",
                defaultValue: organization?.country ?? "",
              },
              { name: "region", label: "Region", defaultValue: organization?.region ?? "" },
              { name: "website", label: "Website", type: "url", defaultValue: "" },
              {
                name: "registrationNum",
                label: "Registration number",
                defaultValue: "",
              },
              {
                name: "fiscalYearStart",
                label: "Fiscal year starts",
                type: "select",
                required: true,
                options: MONTHS,
                defaultValue: String(organization?.fiscalYearStart ?? 1),
              },
              {
                name: "baseCurrency",
                label: "Base currency",
                type: "select",
                required: true,
                options: ["USD", "KRW", "EUR", "GBP", "JPY", "CNY"].map((code) => ({
                  value: code,
                  label: code,
                })),
                defaultValue: organization?.baseCurrency ?? "USD",
              },
              {
                name: "reportingYear",
                label: "Current reporting year",
                type: "number",
                defaultValue: organization?.reportingYear ?? reportingYear,
              },
              { name: "address", label: "Address", type: "textarea", wide: true },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calculation conventions</CardTitle>
          <CardDescription>
            These are chosen per calculation run rather than stored as a single organisation
            setting, because a re-statement under a different GWP vintage or consolidation
            approach has to be an explicit, auditable act.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">GWP version in use</p>
            <p className="text-lg font-semibold">{inventory.gwpVersion}</p>
            <p className="text-[11px] text-muted-foreground">
              Available: {GWP_VERSIONS.join(", ")}. AR6 puts fossil CH₄ at 29.8 and AR5 at 30, so
              the choice moves the total.
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Consolidation approach</p>
            <p className="text-lg font-semibold">
              {humaniseEnum(inventory.consolidationApproach)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Available: {CONSOLIDATION_APPROACHES.map((approach: string) => humaniseEnum(approach)).join(", ")}.
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Scope 2 basis for the total</p>
            <p className="text-lg font-semibold">
              {humaniseEnum(inventory.totals.scope2Basis)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Both bases are always calculated and disclosed: location{" "}
              {formatEmissions(inventory.totals.scope2Location)}, market{" "}
              {formatEmissions(inventory.totals.scope2Market)} {inventory.totals.unit}.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification delivery</CardTitle>
          <CardDescription>
            In-app delivery is complete: a rule&apos;s <code>notify</code> effect writes a{" "}
            <code>Notification</code> row, which appears in{" "}
            <Link href="/notifications" className="underline">
              the notification centre
            </Link>{" "}
            and on the header badge. Every other channel stops at a service you own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs text-muted-foreground">
          <p>
            The events the system raises today are: an anomaly above its severity threshold, a
            verification finding falling overdue, a disclosure deadline approaching, a credit
            approaching expiry, and a calculation completing.
          </p>
          <p>
            A notification whose channel is <code>email</code>, <code>webhook</code>,{" "}
            <code>slack</code> or <code>sms</code> is still <em>recorded</em> — it is never
            silently dropped — but it is not transmitted, and the notification centre lists it
            under &quot;Recorded, not sent&quot; with the credential that is missing. Supplying
            that transport is a deployment decision: the provider, the sender identity and the
            recipient list are all yours to choose. The steps are in{" "}
            <code>{SETUP_GUIDE_PATH}</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
