"use client";

import { ActionForm } from "@/components/shared/form/action-form";
import type { ActionState } from "@/lib/actions/types";
import type { OrganizationSummary } from "@/lib/data/repositories/organization";

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

const CURRENCIES = ["USD", "KRW", "EUR", "GBP", "JPY", "CNY"].map((code) => ({
  value: code,
  label: code,
}));

/**
 * Organisation profile editor.
 *
 * `organizationId` is submitted so `runAction` resolves the tenant from the payload
 * rather than from the session's default — the two differ as soon as the switcher is
 * used.
 */
export function OrganizationProfileForm({
  organizationId,
  organization,
  updateOrganization,
}: {
  readonly organizationId: string;
  readonly organization: OrganizationSummary | null;
  readonly updateOrganization: (input: unknown) => Promise<ActionState<{ readonly id: string }>>;
}) {
  return (
    <ActionForm
      action={updateOrganization}
      hidden={{ organizationId }}
      submitLabel="Save profile"
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
        {
          name: "fiscalYearStart",
          label: "Fiscal year starts",
          type: "select",
          options: MONTHS,
          required: true,
          defaultValue: String(organization?.fiscalYearStart ?? 1),
          description: "Drives fiscalYearBounds() for every reporting period.",
        },
        {
          name: "baseCurrency",
          label: "Base currency",
          type: "select",
          options: CURRENCIES,
          required: true,
          defaultValue: organization?.baseCurrency ?? "USD",
        },
        {
          name: "reportingYear",
          label: "Current reporting year",
          type: "number",
          defaultValue: organization?.reportingYear ?? new Date().getUTCFullYear(),
        },
      ]}
    />
  );
}
