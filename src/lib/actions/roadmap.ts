"use server";

/**
 * Decarbonisation-roadmap actions.
 *
 * The roadmap builder derives milestones from the actions rather than asking the
 * user to declare them, so the milestone rows written here are always consistent
 * with the actions they aggregate — a roadmap whose milestones do not sum to its
 * actions is the single most common defect in a hand-maintained plan.
 */

import { NotFoundError } from "@/lib/core/errors";
import { analyseInvestment } from "@/lib/domain/finance/investment";
import { buildMaccCurve, selectPortfolio } from "@/lib/domain/finance/macc";
import { buildRoadmap } from "@/lib/domain/roadmap/plan";
import { listAbatementTechnologies } from "@/lib/data/repositories/roadmap";
import { prisma } from "@/lib/prisma";
import {
  idSchema,
  investmentAnalysisInputSchema,
  maccPortfolioInputSchema,
  roadmapInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/carbon-strategy", "/scenario-modeling", "/dashboard"] as const;

/**
 * An `InvestmentAnalysis` row requires a roadmap, which the reusable schema does
 * not carry because the same appraisal is also offered standalone by the API.
 */
const investmentAnalysisWithRoadmapSchema = investmentAnalysisInputSchema.extend({
  organizationId: idSchema,
  roadmapId: idSchema,
});

export type BuildRoadmapResult = {
  readonly id: string;
  readonly requiredReduction: number;
  readonly plannedReduction: number;
  readonly residualGap: number;
  readonly residualGapPercent: number;
  readonly isFullyPlanned: boolean;
  readonly milestoneCount: number;
  readonly totalCost: number;
  readonly averageCostPerTonne: number;
  readonly currency: string;
  readonly warnings: readonly string[];
};

/** Builds and stores a roadmap with its derived milestones and sequenced actions. */
export async function buildRoadmapAction(
  rawInput: unknown,
): Promise<ActionState<BuildRoadmapResult>> {
  return runAction(
    {
      name: "buildRoadmap",
      resource: "roadmap",
      action: "create",
      schema: roadmapInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        // The domain builder needs stable ids to sequence by, and the rows do not
        // exist yet, so the payload index is used as the provisional id and mapped
        // back to the created row afterwards.
        const plan = buildRoadmap({
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          baseline: { year: input.baselineYear, emissions: input.baselineEmissions },
          target: { year: input.targetYear, emissions: input.targetEmissions },
          actions: input.actions.map((action, index) => ({
            id: String(index),
            name: action.name,
            description: action.description ?? null,
            category: action.category ?? null,
            priority: action.priority,
            expectedReduction: action.expectedReduction,
            status: action.status,
            costEstimate: action.estimatedCost ?? null,
            startDate: new Date(Date.UTC(action.startYear, 0, 1)),
            endDate: new Date(Date.UTC(action.endYear, 11, 31)),
            technologyId: action.technologyId ?? null,
          })),
        });

        const created = await prisma.$transaction(async (tx) => {
          const roadmap = await tx.decarbonizationRoadmap.create({
            data: {
              organizationId,
              name: plan.roadmap.name,
              description: plan.roadmap.description,
              baselineYear: plan.roadmap.baselineYear,
              targetYear: plan.roadmap.targetYear,
              baselineEmissions: plan.roadmap.baselineEmissions,
              targetEmissions: plan.roadmap.targetEmissions,
              reductionTarget: plan.roadmap.reductionTarget,
              targetType: plan.roadmap.targetType,
              status: input.status,
            },
            select: { id: true },
          });

          // Milestones first, so each action can be attached to the milestone the
          // builder assigned it to.
          const milestoneIdByYear = new Map<number, string>();
          for (const milestone of plan.milestones) {
            const row = await tx.roadmapMilestone.create({
              data: {
                roadmapId: roadmap.id,
                name: milestone.name,
                description: milestone.description,
                targetYear: milestone.targetYear,
                targetReduction: milestone.targetReduction,
                currentProgress: milestone.currentProgress,
                status: milestone.status,
                dueDate: milestone.dueDate,
                completedAt: milestone.completedAt,
              },
              select: { id: true },
            });
            milestoneIdByYear.set(milestone.targetYear, row.id);
          }

          for (const action of plan.actions) {
            await tx.roadmapAction.create({
              data: {
                roadmapId: roadmap.id,
                milestoneId: milestoneIdByYear.get(action.completionYear) ?? null,
                name: action.name,
                description: action.description ?? null,
                category: action.category ?? null,
                priority: action.priority ?? 0,
                expectedReduction: action.expectedReduction,
                unit: plan.unit,
                startDate: action.startDate ?? null,
                endDate: action.endDate ?? null,
                status: action.status ?? "planned",
                costEstimate: action.costEstimate ?? null,
                currency: plan.currency,
                technologyId: action.technologyId ?? null,
              },
            });
          }

          return roadmap.id;
        });

        return {
          data: {
            id: created,
            requiredReduction: plan.requiredReduction,
            plannedReduction: plan.plannedReduction,
            residualGap: plan.residualGap,
            residualGapPercent: plan.residualGapPercent,
            isFullyPlanned: plan.isFullyPlanned,
            milestoneCount: plan.milestones.length,
            totalCost: plan.totalCost,
            averageCostPerTonne: plan.averageCostPerTonne,
            currency: plan.currency,
            warnings: plan.warnings,
          },
          message: plan.isFullyPlanned
            ? `Roadmap "${input.name}" fully covers its ${plan.requiredReduction.toFixed(0)} ${plan.unit} gap.`
            : `Roadmap "${input.name}" is short by ${plan.residualGap.toFixed(0)} ${plan.unit} (${plan.residualGapPercent.toFixed(1)}%).`,
          messageKey: "action.success.buildRoadmap",
          audit: [
            auditEntry(session, {
              entityType: "DecarbonizationRoadmap",
              entityId: created,
              action: "create",
              after: {
                name: input.name,
                baselineYear: input.baselineYear,
                targetYear: input.targetYear,
                requiredReduction: plan.requiredReduction,
                plannedReduction: plan.plannedReduction,
                residualGap: plan.residualGap,
                actions: plan.actions.length,
                milestones: plan.milestones.length,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type InvestmentResult = {
  readonly id: string;
  readonly npv: number;
  readonly irr: number | null;
  readonly paybackPeriod: number | null;
  readonly roi: number;
  readonly riskLevel: string;
  readonly abatementCost: number | null;
  readonly currency: string;
};

/**
 * Appraises an investment against a roadmap and stores the result.
 *
 * The cash-flow series is supplied by the caller, so the derived capex/opex split
 * is read back off the series rather than re-asked: `cashflows[0]` is the upfront
 * cost and the mean of the remainder is the annual net benefit.
 */
export async function analyseInvestmentAction(
  rawInput: unknown,
): Promise<ActionState<InvestmentResult>> {
  return runAction(
    {
      name: "analyseInvestment",
      resource: "roadmap",
      action: "create",
      schema: investmentAnalysisWithRoadmapSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const roadmap = await prisma.decarbonizationRoadmap.findUnique({
          where: { id: input.roadmapId },
          select: { id: true, organizationId: true },
        });
        if (!roadmap || roadmap.organizationId !== organizationId) {
          throw new NotFoundError(`Roadmap ${input.roadmapId} was not found`);
        }

        const [upfront, ...returns] = input.cashflows;
        const annualNet =
          returns.length === 0
            ? 0
            : returns.reduce((total, value) => total + value, 0) / returns.length;

        const analysis = analyseInvestment({
          name: input.name,
          capex: Math.abs(upfront ?? 0),
          annualSavings: Math.max(0, annualNet),
          opex: annualNet < 0 ? Math.abs(annualNet) : 0,
          projectLifeYears: input.lifetime,
          discountRate: input.discountRate,
          currency: input.currency,
          annualAbatement: input.abatement,
        });

        const created = await prisma.investmentAnalysis.create({
          data: {
            roadmapId: roadmap.id,
            name: analysis.name,
            description: analysis.description,
            capex: analysis.capex,
            opex: analysis.opex,
            annualSavings: analysis.annualSavings,
            roi: analysis.roi,
            irr: analysis.irr,
            npv: analysis.npv,
            paybackPeriod: analysis.paybackPeriod,
            currency: analysis.currency,
            discountRate: analysis.discountRate,
            projectLifeYears: analysis.projectLifeYears,
            riskLevel: analysis.riskLevel,
            assumptions: {
              ...analysis.assumptions,
              riskRationale: analysis.riskRationale,
            } as never,
          },
          select: { id: true },
        });

        return {
          data: {
            id: created.id,
            npv: analysis.npv,
            irr: analysis.irr,
            paybackPeriod: analysis.paybackPeriod,
            roi: analysis.roi,
            riskLevel: analysis.riskLevel,
            abatementCost: analysis.abatementCost?.lcoa ?? null,
            currency: analysis.currency,
          },
          message: `NPV ${analysis.npv.toFixed(0)} ${analysis.currency}, payback ${
            analysis.paybackPeriod === null
              ? "never"
              : `${analysis.paybackPeriod.toFixed(1)} yr`
          }.`,
          messageKey: "action.success.analyseInvestment",
          audit: [
            auditEntry(session, {
              entityType: "InvestmentAnalysis",
              entityId: created.id,
              action: "create",
              after: {
                name: analysis.name,
                npv: analysis.npv,
                irr: analysis.irr,
                riskLevel: analysis.riskLevel,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type MaccPortfolioResult = {
  readonly year: number;
  readonly totalAbatement: number;
  readonly totalCost: number;
  readonly averageCost: number;
  readonly unmetAbatement: number;
  readonly meetsTarget: boolean;
  readonly currency: string;
  readonly selections: readonly {
    readonly technologyId: string;
    readonly name: string;
    readonly marginalCost: number;
    readonly selectedAbatement: number;
    readonly isPartial: boolean;
  }[];
};

/**
 * Builds the MACC and selects a least-cost portfolio, then stores the curve.
 *
 * Curve points are replaced for the year rather than appended: a MACC is a
 * snapshot of the options available in one year, and two overlapping snapshots
 * would double-count the potential.
 */
export async function selectMaccPortfolioAction(
  rawInput: unknown,
): Promise<ActionState<MaccPortfolioResult>> {
  return runAction(
    {
      name: "selectMaccPortfolio",
      resource: "roadmap",
      action: "create",
      schema: maccPortfolioInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const technologies = await listAbatementTechnologies();
        const selected =
          input.technologyIds.length > 0
            ? technologies.filter((technology) =>
                input.technologyIds.includes(technology.id),
              )
            : technologies;

        const curve = buildMaccCurve(
          selected.map((technology) => ({
            id: technology.id,
            name: technology.name,
            category: technology.category ?? null,
            abatementPotential: technology.abatementPotential ?? 0,
            costPerTonne: technology.costPerTonne ?? 0,
            technologyReadiness: technology.technologyReadiness ?? null,
          })),
          input.year,
        );
        const portfolio = selectPortfolio(curve, {
          ...(input.abatementTarget !== undefined
            ? { abatementTarget: input.abatementTarget }
            : {}),
          ...(input.budget !== undefined ? { budget: input.budget } : {}),
        });

        await prisma.$transaction([
          prisma.mACCCurve.deleteMany({ where: { year: input.year } }),
          prisma.mACCCurve.createMany({
            data: curve.points.map((point) => ({
              technologyId: point.technologyId,
              name: point.name,
              abatementPotential: point.abatementPotential,
              marginalCost: point.marginalCost,
              cumulativeAbatement: point.cumulativeAbatement,
              year: point.year,
              region: point.region,
              sector: point.sector,
              currency: point.currency,
            })),
          }),
        ]);

        return {
          data: {
            year: input.year,
            totalAbatement: portfolio.totalAbatement,
            totalCost: portfolio.totalCost,
            averageCost: portfolio.averageCost,
            unmetAbatement: portfolio.unmetAbatement,
            meetsTarget: portfolio.meetsTarget,
            currency: portfolio.currency,
            selections: portfolio.selections.map((selection) => ({
              technologyId: selection.technologyId,
              name: selection.name,
              marginalCost: selection.marginalCost,
              selectedAbatement: selection.selectedAbatement,
              isPartial: selection.isPartial,
            })),
          },
          message: `Selected ${portfolio.selections.length} measure(s) delivering ${portfolio.totalAbatement.toFixed(0)} tCO2e at ${portfolio.averageCost.toFixed(0)} ${portfolio.currency}/t.`,
          messageKey: "action.success.selectMaccPortfolio",
          audit: [
            auditEntry(session, {
              entityType: "MACCCurve",
              entityId: `year:${input.year}`,
              action: "update",
              after: {
                year: input.year,
                points: curve.points.length,
                totalAbatementPotential: curve.totalAbatementPotential,
                selected: portfolio.selections.length,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
