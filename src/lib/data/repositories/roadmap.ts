/**
 * Decarbonisation-roadmap repository.
 *
 * The MACC curve, the least-cost portfolio and the investment appraisal are all
 * computed by the finance engines from the abatement technology rows — the numbers
 * in the roadmap view are derived, not stored.
 */

import { analyseInvestment, type InvestmentAnalysisRecord } from "@/lib/domain/finance/investment";
import { buildMaccCurve, selectPortfolio } from "@/lib/domain/finance/macc";
import { buildRoadmap } from "@/lib/domain/roadmap/plan";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_ABATEMENT_TECHNOLOGIES,
  DEMO_CURRENT_YEAR,
  DEMO_ROADMAP,
  DEMO_ROADMAP_ACTIONS,
  type DemoAbatementTechnology,
  type DemoRoadmap,
  type DemoRoadmapAction,
} from "../demo";

import { getInventory } from "./calculation";
import { listTargets } from "./targets";

export async function listAbatementTechnologies(): Promise<
  readonly DemoAbatementTechnology[]
> {
  return withDb<readonly DemoAbatementTechnology[]>(
    async () => {
      const rows = await prisma.abatementTechnology.findMany({ orderBy: { name: "asc" } });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category ?? "",
        description: row.description ?? "",
        technologyReadiness: row.technologyReadiness ?? 0,
        abatementPotential: row.abatementPotential ?? 0,
        costPerTonne: row.costPerTonne ?? 0,
        implementationTime: row.implementationTime ?? "",
        scalability: row.scalability ?? "",
        applicableSectors: row.applicableSectors,
        // CAPEX and savings live on `InvestmentAnalysis`, not on the technology.
        capex: 0,
        annualSavings: 0,
        projectLifeYears: 15,
      }));
    },
    () => DEMO_ABATEMENT_TECHNOLOGIES,
  );
}

export async function getRoadmap(organizationId: string): Promise<DemoRoadmap | null> {
  return withDb<DemoRoadmap | null>(
    async () => {
      const row = await prisma.decarbonizationRoadmap.findFirst({
        where: { organizationId },
        orderBy: { targetYear: "asc" },
      });
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        description: row.description ?? "",
        baselineYear: row.baselineYear,
        targetYear: row.targetYear,
        reductionTarget: row.reductionTarget ?? 0,
        targetType: row.targetType ?? "ABSOLUTE",
        status: row.status,
        publishedAt: row.publishedAt ?? row.updatedAt,
      };
    },
    () => (DEMO_ROADMAP.organizationId === organizationId ? DEMO_ROADMAP : null),
  );
}

export async function listRoadmapActions(
  organizationId: string,
): Promise<readonly DemoRoadmapAction[]> {
  return withDb<readonly DemoRoadmapAction[]>(
    async () => {
      const rows = await prisma.roadmapAction.findMany({
        where: { roadmap: { organizationId } },
        orderBy: [{ priority: "asc" }, { name: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        roadmapId: row.roadmapId,
        technologyId: row.technologyId ?? "",
        name: row.name,
        category: row.category ?? "",
        scope: row.scope ?? "SCOPE_1",
        priority: row.priority,
        expectedReduction: row.expectedReduction ?? 0,
        unit: row.unit,
        startYear: row.startDate?.getUTCFullYear() ?? DEMO_CURRENT_YEAR + 1,
        endYear: row.endDate?.getUTCFullYear() ?? DEMO_CURRENT_YEAR + 2,
        status: row.status,
        owner: row.owner ?? "",
        costEstimate: row.costEstimate ?? 0,
        currency: row.currency,
      }));
    },
    () => DEMO_ROADMAP_ACTIONS,
  );
}

/** The MACC curve and the least-cost portfolio for the residual gap. */
export async function getMaccView(
  organizationId: string,
  options: { readonly year?: number; readonly budget?: number } = {},
) {
  const year = options.year ?? DEMO_CURRENT_YEAR;
  const [technologies, targets, inventory] = await Promise.all([
    listAbatementTechnologies(),
    listTargets(organizationId),
    getInventory(organizationId, year),
  ]);

  const curve = buildMaccCurve(
    technologies.map((technology) => ({
      id: technology.id,
      name: technology.name,
      abatementPotential: technology.abatementPotential,
      costPerTonne: technology.costPerTonne,
      category: technology.category,
    })),
    year,
  );

  const anchor = targets.find((target) => target.boundary === "SCOPE_1_2") ?? targets[0];
  const abatementTarget = anchor
    ? ((anchor.baselineEmissions ?? 0) * anchor.targetReduction) / 100
    : inventory.totals.totalEmissions * 0.42;

  return {
    year,
    curve,
    abatementTarget,
    portfolio: selectPortfolio(curve, {
      abatementTarget,
      ...(options.budget !== undefined ? { budget: options.budget } : {}),
    }),
  };
}

/** Roadmap milestones and the residual gap to target. */
export async function getRoadmapPlan(organizationId: string) {
  const [roadmap, actions, targets] = await Promise.all([
    getRoadmap(organizationId),
    listRoadmapActions(organizationId),
    listTargets(organizationId),
  ]);
  if (!roadmap) return null;

  const anchor = targets.find((target) => target.boundary === "SCOPE_1_2") ?? targets[0];
  const baselineEmissions = anchor?.baselineEmissions ?? 0;
  const targetEmissions = anchor
    ? baselineEmissions * (1 - anchor.targetReduction / 100)
    : baselineEmissions;

  return {
    roadmap,
    plan: buildRoadmap({
      name: roadmap.name,
      description: roadmap.description,
      baseline: { year: roadmap.baselineYear, emissions: baselineEmissions },
      target: {
        year: roadmap.targetYear,
        emissions: targetEmissions,
        targetType: roadmap.targetType,
      },
      actions: actions.map((action) => ({
        id: action.id,
        name: action.name,
        category: action.category,
        scope: action.scope,
        priority: action.priority,
        expectedReduction: action.expectedReduction,
        unit: action.unit,
        startDate: new Date(Date.UTC(action.startYear, 0, 1)),
        endDate: new Date(Date.UTC(action.endYear, 11, 31)),
        status: action.status,
        owner: action.owner,
        costEstimate: action.costEstimate,
        currency: action.currency,
        technologyId: action.technologyId,
      })),
    }),
  };
}

/** Investment appraisal per technology, for the roadmap table. */
export async function listInvestmentAnalyses(
  organizationId: string,
): Promise<readonly (InvestmentAnalysisRecord & { readonly technologyId: string })[]> {
  const technologies = await listAbatementTechnologies();
  const roadmap = await getRoadmap(organizationId);
  const discountRate = 0.08;
  return technologies
    .filter((technology) => technology.capex > 0)
    .map((technology) => ({
      technologyId: technology.id,
      ...analyseInvestment({
        name: technology.name,
        capex: technology.capex,
        annualSavings: technology.annualSavings,
        annualAbatement: technology.abatementPotential,
        projectLifeYears: technology.projectLifeYears,
        discountRate,
        currency: "USD",
        assumptions: {
          roadmapId: roadmap?.id ?? null,
          discountRate,
          projectLifeYears: technology.projectLifeYears,
        },
      }),
    }));
}
