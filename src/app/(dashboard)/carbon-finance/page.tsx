/**
 * Carbon finance module.
 *
 * Credit registry and balances, retirement, gross-versus-net emissions, ETS
 * position, REC/PPA coverage, internal carbon price impact and the price history —
 * every figure from `src/lib/domain/credits/**` over the stored credit and
 * retirement rows.
 */

import { connection } from "next/server";
import { Coins, Flame, Scale, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PlanGateLocked } from "@/components/shared/plan-gate";
import { ActionForm } from "@/components/shared/form/action-form";
import {
  createCarbonCreditAction,
  retireCreditsAction,
  setInternalCarbonPriceAction,
} from "@/lib/actions/credits";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { CREDIT_STATUSES } from "@/lib/core/enums";
import { hasModuleAccess } from "@/lib/core/plans";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import { getCarbonFinanceView } from "@/lib/data/repositories/credits";
import { getOrganization } from "@/lib/data/repositories/organization";
import {
  formatCurrency,
  formatDate,
  formatEmissions,
  formatNumber,
  formatPercent,
  humaniseEnum,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n/server";

import { NetEmissionsPanel } from "./_components/net-emissions-panel";
import { RetirementForm } from "./_components/retirement-form";

type CreditRow = {
  readonly id: string;
  readonly serialNumber: string;
  readonly registry: string;
  readonly projectName: string;
  readonly projectType: string;
  readonly vintage: number | null;
  readonly issued: number;
  readonly retired: number;
  readonly available: number;
  readonly status: string;
  readonly expiresAt: string | null;
  readonly unit: string;
};

const creditColumns: ColumnDef<CreditRow, unknown>[] = [
  { id: "serial", header: "Serial", accessorFn: (row) => row.serialNumber },
  { id: "registry", header: "Registry", accessorFn: (row) => row.registry },
  { id: "project", header: "Project", accessorFn: (row) => row.projectName },
  { id: "projectType", header: "Type", accessorFn: (row) => row.projectType },
  {
    id: "vintage",
    header: "Vintage",
    accessorFn: (row) => row.vintage ?? 0,
  },
  {
    id: "issued",
    header: "Issued",
    accessorFn: (row) => row.issued,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{formatEmissions(row.original.issued)}</span>
    ),
  },
  {
    id: "retired",
    header: "Retired",
    accessorFn: (row) => row.retired,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{formatEmissions(row.original.retired)}</span>
    ),
  },
  {
    id: "available",
    header: "Available",
    accessorFn: (row) => row.available,
    cell: ({ row }) => (
      <span className="font-mono text-xs font-semibold">
        {formatEmissions(row.original.available)}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (row) => row.status,
    cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
  },
  {
    id: "expires",
    header: "Expires",
    accessorFn: (row) => row.expiresAt ?? "",
    cell: ({ row }) => (
      <span className="font-mono text-[11px]">
        {row.original.expiresAt ? formatDate(row.original.expiresAt) : "—"}
      </span>
    ),
  },
];

export default async function CarbonFinancePage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();
  const organization = await getOrganization(organizationId);
  if (!hasModuleAccess(organization?.plan ?? "TRIAL", "carbon-finance")) {
    return <PlanGateLocked module="carbon-finance" />;
  }

  const years = await listReportingYears(organizationId);
  const reportingYear = years[0] ?? new Date().getUTCFullYear();

  const view = await getCarbonFinanceView(organizationId, { reportingYear });
  const { portfolio, valuation, net, ets, ppaCoverage, recCoverage, expiry, prices } = view;

  const creditById = new Map(portfolio.credits.map((credit) => [credit.id, credit]));
  const creditRows: CreditRow[] = portfolio.balance.credits.map((row) => {
    const credit = creditById.get(row.creditId);
    return {
      id: row.creditId,
      serialNumber: row.serialNumber ?? row.creditId,
      registry: credit?.registry ?? "—",
      projectName: credit?.projectName ?? "—",
      projectType: credit?.projectType ?? "—",
      vintage: row.vintage,
      issued: row.issuedQuantity,
      retired: row.retiredQuantity,
      available: row.availableQuantity,
      status: row.status,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      unit: row.unit,
    };
  });

  const vintages = [
    ...new Set(
      portfolio.balance.byVintage
        .map((row) => row.vintage)
        .filter((vintage): vintage is number => vintage !== null),
    ),
  ].sort((a, b) => a - b);
  const registries = [
    ...new Set(portfolio.credits.map((credit) => credit.registry).filter(Boolean)),
  ] as string[];

  const latestPrices = [...prices]
    .sort((a, b) => b.priceDate.getTime() - a.priceDate.getTime())
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["finance.title"]}
        description={dict["finance.desc"]}
        meta={[
          { label: dict["finance.meta.reportingYear"], value: String(reportingYear) },
          { label: dict["finance.meta.credits"], value: formatNumber(portfolio.credits.length) },
          {
            label: dict["finance.meta.retirable"],
            value: `${formatEmissions(portfolio.balance.totalAvailable)} ${net.unit}`,
          },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={dict["finance.kpi.grossEmissions"]}
          value={formatEmissions(net.grossEmissions)}
          unit={net.unit}
          icon={Scale}
          description={dict["finance.kpi.grossEmissionsDesc"]}
          source="buildInventory()"
        />
        <KpiCard
          title={dict["finance.netEmissions"]}
          value={formatEmissions(net.netEmissions)}
          unit={net.unit}
          icon={Flame}
          description={`${formatPercent(net.offsetShare * 100)} ${dict["finance.kpi.netEmissionsDesc"]}`}
          source="netEmissions()"
        />
        <KpiCard
          title={dict["finance.kpi.portfolioMarketValue"]}
          value={formatCurrency(valuation.totalMarketValue, valuation.currency)}
          icon={Coins}
          description={`unrealised ${formatCurrency(valuation.totalUnrealisedGain, valuation.currency)} on ${formatEmissions(valuation.totalQuantity)} ${valuation.unit}`}
          source="markToMarket()"
          goodDirection="up"
        />
        <KpiCard
          title={dict["finance.kpi.etsPosition"]}
          value={formatEmissions(ets.position)}
          unit={ets.unit}
          icon={TrendingUp}
          description={
            ets.deficit > 0
              ? `${formatEmissions(ets.deficit)} short — compliance cost ${formatCurrency(ets.complianceCost, ets.currency)}`
              : `${formatEmissions(ets.surplus)} long — worth ${formatCurrency(ets.surplusValue, ets.currency)}`
          }
          source="etsPosition()"
          goodDirection="up"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{dict["finance.card.grossVsNet"]}</CardTitle>
          <CardDescription>
            {dict["finance.card.grossVsNetDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NetEmissionsPanel net={net} reportingYear={reportingYear} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dict["finance.card.creditRegistry"]}</CardTitle>
          <CardDescription>
            {dict["finance.card.creditRegistryDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DataTable
            id="credit-table"
            columns={creditColumns}
            data={creditRows}
            pageSize={10}
            searchPlaceholder="Filter credits…"
            emptyState={<EmptyState title={dict["finance.empty.noCredits"]} />}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium">{dict["finance.label.byVintage"]}</p>
              <ul className="space-y-0.5 text-xs">
                {portfolio.balance.byVintage.map((row) => (
                  <li key={String(row.vintage)} className="flex justify-between font-mono">
                    <span>{row.vintage ?? "no vintage"}</span>
                    <span>
                      {formatEmissions(row.available)} available of{" "}
                      {formatEmissions(row.issued)} issued ({row.creditCount} credits)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">{dict["finance.label.byStatus"]}</p>
              <ul className="space-y-0.5 text-xs">
                {portfolio.balance.byStatus.map((row) => (
                  <li key={row.status} className="flex justify-between font-mono">
                    <span>{row.status}</span>
                    <span>{formatEmissions(row.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {(expiry.expiring.length > 0 || expiry.expired.length > 0) && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {expiry.expiring.length} credit{expiry.expiring.length === 1 ? "" : "s"} totalling{" "}
              {formatEmissions(expiry.expiringQuantity)} {expiry.unit} expire within{" "}
              {expiry.horizonDays} days — retire them or the volume is lost.
              {expiry.expired.length > 0
                ? ` ${expiry.expired.length} credit(s) totalling ${formatEmissions(expiry.expiredQuantity)} ${expiry.unit} have already expired unused.`
                : ""}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dict["finance.card.retireCredits"]}</CardTitle>
            <CardDescription>
              {dict["finance.card.retireCreditsDesc"]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RetirementForm
              organizationId={organizationId}
              reportingYear={reportingYear}
              vintages={vintages}
              registries={registries}
              available={portfolio.balance.totalAvailable}
              unit={net.unit}
              retireCredits={retireCreditsAction}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{dict["finance.card.energyAttribute"]}</CardTitle>
            <CardDescription>
              {dict["finance.card.energyAttributeDesc"]}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {([
              ["PPA", ppaCoverage],
              ["REC", recCoverage],
            ] as const).map(([label, coverage]) => (
              <div key={label} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{label} coverage</span>
                  <span className="font-mono text-xs">
                    {formatPercent(coverage.coverage * 100)} of{" "}
                    {formatNumber(coverage.consumption)} {coverage.unit}
                  </span>
                </div>
                <span className="block h-2 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(100, coverage.coverage * 100)}%` }}
                  />
                </span>
                <p className="text-[11px] text-muted-foreground">
                  {coverage.instrumentCount} instrument
                  {coverage.instrumentCount === 1 ? "" : "s"} · applied{" "}
                  {formatNumber(coverage.appliedVolume)} {coverage.unit} · uncovered{" "}
                  {formatNumber(coverage.uncoveredVolume)} {coverage.unit}
                  {coverage.excessVolume > 0
                    ? ` · ${formatNumber(coverage.excessVolume)} ${coverage.unit} in excess`
                    : ""}
                  {coverage.totalCost !== null
                    ? ` · cost ${formatCurrency(coverage.totalCost, coverage.currency)}`
                    : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{dict["finance.card.etsAndInternalPrice"]}</CardTitle>
          <CardDescription>
            {ets.scheme} compliance year {ets.complianceYear} — status {ets.status}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1 font-mono">
              <span className="text-muted-foreground">Allowances</span>
              <span>
                {formatEmissions(ets.allowances)} {ets.unit}
              </span>
              <span className="text-muted-foreground">Verified obligation</span>
              <span>
                {formatEmissions(ets.verified)} {ets.unit}
              </span>
              <span className="text-muted-foreground">Surrendered</span>
              <span>
                {formatEmissions(ets.surrendered)} {ets.unit}
              </span>
              <span className="text-muted-foreground">Outstanding obligation</span>
              <span>
                {formatEmissions(ets.outstandingObligation)} {ets.unit}
              </span>
              <span className="text-muted-foreground">Compliance cost</span>
              <span>{formatCurrency(ets.complianceCost, ets.currency)}</span>
              <span className="text-muted-foreground">Penalty exposure</span>
              <span>{formatCurrency(ets.penaltyExposure, ets.currency)}</span>
            </div>
          </div>

          <div className="space-y-2">
            {view.internalPriceImpact && view.internalPrice ? (
              <div className="space-y-1 text-xs">
                <p className="text-sm font-medium">
                  Internal carbon price:{" "}
                  {formatCurrency(view.internalPrice.price, view.internalPrice.currency, 2)} per{" "}
                  {view.internalPrice.unit}
                </p>
                <p className="font-mono">
                  Shadow cost of the inventory:{" "}
                  {formatCurrency(
                    view.internalPriceImpact.shadowCost,
                    view.internalPriceImpact.currency,
                  )}
                </p>
                <p className="text-muted-foreground">
                  {view.internalPrice.purpose} · methodology {view.internalPrice.methodology} ·
                  effective from {formatDate(view.internalPrice.effectiveFrom)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No `InternalCarbonPrice` row: set one below to price the inventory into capital
                decisions.
              </p>
            )}
            <ActionForm
              action={setInternalCarbonPriceAction}
              hidden={{ organizationId }}
              columns={2}
              submitLabel="Save internal carbon price"
              fields={[
                { name: "price", label: "Price per tonne", type: "number", step: "any", required: true },
                {
                  name: "currency",
                  label: "Currency",
                  type: "select",
                  required: true,
                  defaultValue: "USD",
                  options: ["USD", "KRW", "EUR"].map((code) => ({ value: code, label: code })),
                },
                { name: "purpose", label: "Purpose", placeholder: "capital allocation" },
                { name: "effectiveFrom", label: "Effective from", type: "date", required: true },
                { name: "methodology", label: "Methodology", wide: true },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dict["finance.card.pricesAndNewCredits"]}</CardTitle>
          <CardDescription>
            {dict["finance.card.pricesAndNewCreditsDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="prices">
            <TabsList variant="line">
              <TabsTrigger value="prices">{dict["finance.tab.priceHistory"]}</TabsTrigger>
              <TabsTrigger value="valuation">{dict["finance.tab.valuationDetail"]}</TabsTrigger>
              <TabsTrigger value="new">{dict["finance.tab.registerCredit"]}</TabsTrigger>
            </TabsList>

            <TabsContent value="prices" className="pt-3">
              {latestPrices.length === 0 ? (
                <EmptyState title={dict["finance.empty.noPriceObservations"]} />
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium">{dict["finance.table.date"]}</th>
                      <th className="text-left font-medium">{dict["finance.table.market"]}</th>
                      <th className="text-left font-medium">{dict["finance.table.region"]}</th>
                      <th className="text-right font-medium">{dict["finance.table.price"]}</th>
                      <th className="text-left font-medium">{dict["finance.table.source"]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestPrices.map((price) => (
                      <tr key={`${price.market}-${price.priceDate.toISOString()}`} className="border-t">
                        <td className="py-1">{formatDate(price.priceDate)}</td>
                        <td className="py-1">{price.market}</td>
                        <td className="py-1">{price.region ?? "—"}</td>
                        <td className="py-1 text-right font-mono">
                          {formatCurrency(price.price, price.currency, 2)} / {price.unit}
                        </td>
                        <td className="py-1 text-muted-foreground">{price.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TabsContent>

            <TabsContent value="valuation" className="space-y-1.5 pt-3">
              {valuation.valuations.map((row) => (
                <div
                  key={row.creditId}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs"
                >
                  <span className="font-medium">
                    {creditById.get(row.creditId)?.serialNumber ?? row.creditId}
                  </span>
                  <Badge variant="outline">{row.market ?? "unpriced"}</Badge>
                  <span className="font-mono">
                    {formatEmissions(row.quantity)} {valuation.unit} ×{" "}
                    {formatCurrency(row.marketPrice ?? 0, valuation.currency, 2)}
                  </span>
                  <span className="ml-auto font-mono">
                    book {formatCurrency(row.bookValue ?? 0, valuation.currency)} → market{" "}
                    {formatCurrency(row.marketValue ?? 0, valuation.currency)}
                  </span>
                </div>
              ))}
              {valuation.unpricedCreditIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {valuation.unpricedCreditIds.length} credit
                  {valuation.unpricedCreditIds.length === 1 ? "" : "s"} had no applicable market
                  price and are excluded from the totals rather than valued at zero.
                </p>
              )}
            </TabsContent>

            <TabsContent value="new" className="pt-3">
              <ActionForm
                action={createCarbonCreditAction}
                hidden={{ organizationId }}
                submitLabel="Register credit"
                fields={[
                  { name: "serialNumber", label: "Serial number" },
                  { name: "registry", label: "Registry", placeholder: "Verra, Gold Standard…" },
                  { name: "projectName", label: "Project name" },
                  { name: "projectType", label: "Project type" },
                  { name: "vintage", label: "Vintage", type: "number" },
                  {
                    name: "quantity",
                    label: "Quantity (tCO2e)",
                    type: "number",
                    step: "any",
                    required: true,
                  },
                  {
                    name: "status",
                    label: "Status",
                    type: "select",
                    defaultValue: "ACTIVE",
                    options: CREDIT_STATUSES.map((status) => ({
                      value: status,
                      label: humaniseEnum(status),
                    })),
                  },
                  { name: "verificationStandard", label: "Verification standard" },
                  { name: "country", label: "Country (ISO-2)" },
                  { name: "methodology", label: "Methodology" },
                  { name: "issuedAt", label: "Issued at", type: "date" },
                  { name: "expiresAt", label: "Expires at", type: "date" },
                  { name: "price", label: "Purchase price", type: "number", step: "any" },
                  {
                    name: "currency",
                    label: "Currency",
                    type: "select",
                    options: ["USD", "KRW", "EUR"].map((code) => ({ value: code, label: code })),
                  },
                ]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
