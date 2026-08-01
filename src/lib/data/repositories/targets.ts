/**
 * Science-based target repository.
 *
 * Pathways and progress are *computed* by the SBTi engine from the target
 * parameters and the calculated inventory — never stored — so a change to the
 * inventory immediately moves the progress figures.
 */

import type { TargetBoundary, TargetStatus } from "@/lib/core/enums";
import {
  absoluteContractionPathway,
  evaluateProgress,
  netZeroPlan,
  validateTargetAgainstCriteria,
} from "@/lib/domain/targets/sbti";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_ANNUAL_REDUCTION_RATE,
  DEMO_CARBON_BUDGET,
  DEMO_NET_ZERO_COMMITMENT,
  DEMO_TARGETS,
  DEMO_TARGET_TYPES,
  type DemoCarbonBudget,
  type DemoTarget,
  type DemoTargetType,
} from "../demo";

import { getInventory } from "./calculation";

export type TargetRow = DemoTarget & {
  readonly baselineEmissions: number | null;
  readonly currentEmissions: number | null;
};

/** Emissions inside a target boundary, taken from the calculated inventory. */
async function boundaryEmissions(
  organizationId: string,
  reportingYear: number,
  boundary: TargetBoundary,
): Promise<number> {
  const inventory = await getInventory(organizationId, reportingYear);
  const totals = inventory.totals;
  switch (boundary) {
    case "SCOPE_1_2":
      return totals.scope1Total + totals.scope2Location;
    case "SCOPE_3_ONLY":
      return totals.scope3Total;
    case "SCOPE_1_2_3":
    case "FULL_VALUE_CHAIN":
      return totals.totalEmissions;
    case "FLAG":
      return 0;
    default:
      return totals.totalEmissions;
  }
}

export async function listTargets(organizationId: string): Promise<readonly TargetRow[]> {
  const rows = await withDb<readonly DemoTarget[]>(
    async () => {
      const found = await prisma.scienceBasedTarget.findMany({
        where: { organizationId },
        orderBy: [{ targetYear: "asc" }, { name: "asc" }],
      });
      return found.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        targetTypeId: row.targetTypeId ?? "",
        name: row.name,
        boundary: row.boundary,
        baselineYear: row.baselineYear,
        targetYear: row.targetYear,
        targetReduction: row.targetReduction,
        methodology: row.methodology ?? "",
        status: row.status as TargetStatus,
        submittedAt: row.submittedAt,
        approvedAt: row.approvedAt,
        validatedBy: row.validatedBy,
        scopes:
          row.boundary === "SCOPE_3_ONLY"
            ? (["SCOPE_3"] as const)
            : (["SCOPE_1", "SCOPE_2_LOCATION", "SCOPE_2_MARKET"] as const),
      }));
    },
    () => DEMO_TARGETS.filter((target) => target.organizationId === organizationId),
  );

  return Promise.all(
    rows.map(async (target) => ({
      ...target,
      baselineEmissions: await boundaryEmissions(
        organizationId,
        target.baselineYear,
        target.boundary,
      ),
      currentEmissions: await boundaryEmissions(
        organizationId,
        target.baselineYear + 1,
        target.boundary,
      ),
    })),
  );
}

export type TargetPathwayView = {
  readonly target: TargetRow;
  readonly pathway: ReturnType<typeof absoluteContractionPathway>;
  readonly progress: ReturnType<typeof evaluateProgress> | null;
  readonly criteria: ReturnType<typeof validateTargetAgainstCriteria>;
};

/** Pathway, progress and SBTi eligibility warnings for one target. */
export async function getTargetPathway(
  organizationId: string,
  targetId: string,
  options: { readonly asOfYear?: number } = {},
): Promise<TargetPathwayView | null> {
  const targets = await listTargets(organizationId);
  const target = targets.find((row) => row.id === targetId);
  if (!target) return null;

  const baselineEmissions = target.baselineEmissions ?? 0;
  const pathway = absoluteContractionPathway({
    baselineYear: target.baselineYear,
    baselineEmissions,
    targetYear: target.targetYear,
    annualRate: DEMO_ANNUAL_REDUCTION_RATE,
  });

  const asOfYear = options.asOfYear ?? target.baselineYear + 1;
  const actual = await boundaryEmissions(organizationId, asOfYear, target.boundary);
  const inventory = await getInventory(organizationId, asOfYear);

  const progress =
    baselineEmissions > 0
      ? evaluateProgress(
          {
            baselineYear: target.baselineYear,
            baselineEmissions,
            targetYear: target.targetYear,
            // `targetReduction` is a percentage, per SBTi convention.
            targetEmissions: baselineEmissions * (1 - target.targetReduction / 100),
            pathway: pathway.points,
          },
          [{ year: asOfYear, emissions: actual }],
        )
      : null;

  const criteria = validateTargetAgainstCriteria({
    boundary: target.boundary,
    baselineYear: target.baselineYear,
    baselineEmissions,
    targetYear: target.targetYear,
    targetReduction: target.targetReduction,
    submissionYear: target.submittedAt?.getUTCFullYear(),
    scope1Emissions: inventory.totals.scope1Total,
    scope2Emissions: inventory.totals.scope2Location,
    scope3Emissions: inventory.totals.scope3Total,
  });

  return { target, pathway, progress, criteria };
}

export async function getNetZeroPlan(organizationId: string) {
  const targets = await listTargets(organizationId);
  const anchor = targets.find((target) => target.boundary === "SCOPE_1_2") ?? targets[0];
  if (!anchor) return null;
  const baselineEmissions = anchor.baselineEmissions ?? 0;
  return netZeroPlan({
    baselineYear: anchor.baselineYear,
    baselineEmissions,
    netZeroYear: DEMO_NET_ZERO_COMMITMENT.netZeroYear,
    longTermReduction: 1 - DEMO_NET_ZERO_COMMITMENT.residualShare,
    neutralizationStrategy: DEMO_NET_ZERO_COMMITMENT.neutralisationApproach,
  });
}

export async function listTargetTypes(): Promise<readonly DemoTargetType[]> {
  return withDb<readonly DemoTargetType[]>(
    async () => {
      const rows = await prisma.targetType.findMany({ orderBy: { name: "asc" } });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        description: row.description ?? "",
        methodology: row.methodology ?? "",
        pathway: row.pathway ?? "",
      }));
    },
    () => DEMO_TARGET_TYPES,
  );
}

export async function getCarbonBudget(
  organizationId: string,
): Promise<DemoCarbonBudget | null> {
  return withDb<DemoCarbonBudget | null>(
    async () => {
      const row = await prisma.carbonBudget.findFirst({
        where: { organizationId },
        orderBy: { startYear: "desc" },
      });
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        totalBudget: row.totalBudget,
        unit: row.unit,
        startYear: row.startYear,
        endYear: row.endYear,
        temperature: row.temperature ?? 1.5,
        methodology: row.methodology ?? "",
        status: row.status,
      };
    },
    () => (DEMO_CARBON_BUDGET.organizationId === organizationId ? DEMO_CARBON_BUDGET : null),
  );
}
