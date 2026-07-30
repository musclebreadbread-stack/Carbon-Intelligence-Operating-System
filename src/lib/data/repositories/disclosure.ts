/**
 * ESG disclosure repository.
 *
 * Numeric datapoints are auto-populated by `mapInventoryToRequirements` from the
 * calculated inventory and merged with the authored narrative responses, so a
 * completeness figure is always the truth about the current inventory rather than a
 * stored percentage that can drift.
 */

import type { ReportingFramework } from "@/lib/core/enums";
import {
  assembleReport,
  completeness,
  mapInventoryToRequirements,
  type DisclosureContext,
} from "@/lib/domain/disclosure/map";
import { requirementsFor } from "@/lib/domain/disclosure/requirements";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_CURRENT_YEAR,
  DEMO_DISCLOSURE_FRAMEWORK_ROWS,
  DEMO_DISCLOSURE_REPORTS,
  DEMO_NARRATIVE_RESPONSES,
  type DemoDisclosureFrameworkRow,
  type DemoDisclosureReport,
  type DemoNarrativeResponse,
} from "../demo";

import { getInventory } from "./calculation";
import { getInternalCarbonPrice } from "./credits";

/** Frameworks TNFD aside — `mapInventoryToRequirements` throws for an empty catalogue. */
export function isMappableFramework(framework: ReportingFramework): boolean {
  return requirementsFor(framework).length > 0;
}

export async function listDisclosureFrameworks(): Promise<
  readonly DemoDisclosureFrameworkRow[]
> {
  return withDb<readonly DemoDisclosureFrameworkRow[]>(
    async () => {
      const rows = await prisma.disclosureFramework.findMany({
        orderBy: { code: "asc" },
        include: { _count: { select: { requirements: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        version: row.version ?? "",
        publisher: row.publisher ?? "",
        url: row.url ?? "",
        isActive: row.isActive,
        requirementCount: row._count.requirements,
      }));
    },
    () => DEMO_DISCLOSURE_FRAMEWORK_ROWS,
  );
}

export async function listDisclosureReports(
  organizationId: string,
): Promise<readonly DemoDisclosureReport[]> {
  return withDb<readonly DemoDisclosureReport[]>(
    async () => {
      const rows = await prisma.disclosureReport.findMany({
        where: { organizationId },
        orderBy: [{ reportingYear: "desc" }, { framework: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        framework: row.framework,
        reportingYear: row.reportingYear,
        status: row.status,
        submittedAt: row.submittedAt,
        publishedAt: row.publishedAt,
        dueDate: row.dueDate ?? new Date(Date.UTC(row.reportingYear + 1, 5, 30)),
        notes: row.notes ?? "",
        createdById: row.createdById ?? "",
      }));
    },
    () =>
      DEMO_DISCLOSURE_REPORTS.filter((report) => report.organizationId === organizationId),
  );
}

export async function listNarrativeResponses(
  organizationId: string,
): Promise<readonly DemoNarrativeResponse[]> {
  return withDb<readonly DemoNarrativeResponse[]>(
    async () => {
      const rows = await prisma.disclosureResponse.findMany({
        where: { report: { organizationId } },
        include: {
          requirement: { select: { code: true, framework: { select: { code: true } } } },
        },
      });
      return rows
        .filter((row) => row.value !== null && row.value.length > 0)
        .map((row) => ({
          id: row.id,
          reportId: row.reportId ?? "",
          framework: row.requirement.framework.code,
          requirementCode: row.requirement.code,
          value: row.value ?? "",
          status: row.status,
          reviewedBy: row.reviewedBy,
          reviewedAt: row.reviewedAt,
        }));
    },
    () => DEMO_NARRATIVE_RESPONSES,
  );
}

/** Everything needed to auto-populate the numeric datapoints. */
async function disclosureContext(
  organizationId: string,
  reportingYear: number,
): Promise<DisclosureContext> {
  const [inventory, baseline, internalPrice] = await Promise.all([
    getInventory(organizationId, reportingYear),
    getInventory(organizationId, reportingYear - 1),
    getInternalCarbonPrice(organizationId),
  ]);

  return {
    inventory: inventory.totals,
    reportingYear,
    gwpVersion: inventory.gwpVersion,
    consolidationApproach: inventory.consolidationApproach,
    internalCarbonPrice: internalPrice?.price,
    baseYear: reportingYear - 1,
    baseYearEmissions: baseline.totals.totalEmissions,
  };
}

export type FrameworkCompletenessView = {
  readonly framework: ReportingFramework;
  readonly reportingYear: number;
  readonly mapping: ReturnType<typeof mapInventoryToRequirements>;
  readonly completeness: ReturnType<typeof completeness>;
};

/** Auto-populated numbers plus narrative, scored for completeness. */
export async function getFrameworkCompleteness(
  organizationId: string,
  framework: ReportingFramework,
  reportingYear: number = DEMO_CURRENT_YEAR,
): Promise<FrameworkCompletenessView | null> {
  if (!isMappableFramework(framework)) return null;

  const context = await disclosureContext(organizationId, reportingYear);
  const mapping = mapInventoryToRequirements(context, framework);
  const narratives = (await listNarrativeResponses(organizationId)).filter(
    (response) => response.framework === framework,
  );

  const merged = [
    ...mapping.responses,
    ...narratives.map((response) => ({
      requirementCode: response.requirementCode,
      framework,
      value: response.value,
      numericValue: null,
      status: response.status,
      notes: null,
      unit: null,
      isAutoPopulated: false,
    })),
  ];

  return {
    framework,
    reportingYear,
    mapping,
    completeness: completeness(merged, requirementsFor(framework)),
  };
}

/** Completeness for every mappable framework, for the disclosure cards. */
export async function listFrameworkCompleteness(
  organizationId: string,
  reportingYear: number = DEMO_CURRENT_YEAR,
): Promise<readonly FrameworkCompletenessView[]> {
  const frameworks = await listDisclosureFrameworks();
  const views = await Promise.all(
    frameworks
      .filter((row) => isMappableFramework(row.code))
      .map((row) => getFrameworkCompleteness(organizationId, row.code, reportingYear)),
  );
  return views.filter((view): view is FrameworkCompletenessView => view !== null);
}

/** The assembled section tree used by report generation. */
export async function getAssembledReport(
  organizationId: string,
  framework: ReportingFramework,
  reportingYear: number = DEMO_CURRENT_YEAR,
) {
  const view = await getFrameworkCompleteness(organizationId, framework, reportingYear);
  if (!view) return null;
  const context = await disclosureContext(organizationId, reportingYear);
  return assembleReport(framework, view.mapping.responses, context);
}
