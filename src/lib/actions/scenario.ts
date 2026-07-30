"use server";

/**
 * Scenario-modelling actions.
 *
 * `simulateScenarioAction` accepts `persist: false`, and that path is marked
 * read-only so it works in demo mode: a planner can explore levers with no
 * database and still see genuinely projected numbers. `persist: true` requires a
 * database like any other mutation, so the two branches are dispatched to two
 * separate action definitions rather than being smuggled through one.
 */

import { NotFoundError } from "@/lib/core/errors";
import {
  compareScenarios,
  projectScenario,
  SCENARIO_DEFAULT_LEVERS,
  type ScenarioProjection,
} from "@/lib/domain/scenarios/project";
import { consumeBudget } from "@/lib/domain/scenarios/budget";
import { leversFrom } from "@/lib/data/repositories/scenario";
import { prisma } from "@/lib/prisma";
import {
  carbonBudgetInputSchema,
  compareScenariosInputSchema,
  scenarioInputSchema,
  simulateScenarioInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/scenario-modeling", "/carbon-strategy", "/dashboard"] as const;

export type SimulateScenarioResult = {
  readonly scenarioId: string | null;
  readonly persisted: boolean;
  readonly baselineEmissions: number;
  readonly targetEmissions: number;
  readonly targetReduction: number;
  readonly cumulativeEmissions: number;
  readonly cumulativeCost: number;
  readonly unit: string;
  readonly points: readonly {
    readonly year: number;
    readonly totalEmissions: number;
    readonly reductionPercent: number;
    readonly costImplication: number;
  }[];
};

/** Shared projection step, so the persisting and preview paths cannot diverge. */
function project(input: {
  readonly type: ScenarioProjection["type"];
  readonly name: string;
  readonly targetYear: number;
  readonly baseline: {
    readonly year: number;
    readonly scope1Emissions: number;
    readonly scope2Emissions: number;
    readonly scope3Emissions: number;
    readonly energyConsumption?: number;
    readonly renewableShare?: number;
  };
  readonly assumptions: readonly {
    readonly parameter: string;
    readonly value: number;
  }[];
}): ScenarioProjection {
  return projectScenario({
    type: input.type,
    name: input.name,
    targetYear: input.targetYear,
    baseline: input.baseline,
    // An empty assumption list means "use this scenario type's published levers",
    // which is how a one-click STATED_POLICIES run produces a defensible curve.
    assumptions:
      input.assumptions.length > 0
        ? input.assumptions
        : Object.entries(SCENARIO_DEFAULT_LEVERS[input.type]).map(
            ([parameter, value]) => ({ parameter, value }),
          ),
  });
}

function summarise(
  projection: ScenarioProjection,
  scenarioId: string | null,
  persisted: boolean,
): SimulateScenarioResult {
  return {
    scenarioId,
    persisted,
    baselineEmissions: projection.baselineEmissions,
    targetEmissions: projection.targetEmissions,
    targetReduction: projection.targetReduction,
    cumulativeEmissions: projection.cumulativeEmissions,
    cumulativeCost: projection.cumulativeCost,
    unit: projection.unit,
    points: projection.points.map((point) => ({
      year: point.year,
      totalEmissions: point.totalEmissions,
      reductionPercent: point.metadata.reductionPercent,
      costImplication: point.costImplication,
    })),
  };
}

/**
 * Projects a scenario and stores the year series as `ScenarioResult` rows.
 *
 * A re-run replaces the previous results for the scenario rather than appending,
 * so the chart never shows two overlapping series for one scenario.
 */
export async function simulateScenarioAction(
  rawInput: unknown,
): Promise<ActionState<SimulateScenarioResult>> {
  return runAction(
    {
      name: "simulateScenario",
      resource: "scenario",
      action: "create",
      schema: simulateScenarioInputSchema,
      revalidate: [...PATHS],
      attributes: (input) => ({ reportingYear: input.baseline.year }),
      handler: async ({ session, input, organizationId }) => {
        const projection = project({
          type: input.type,
          name: input.name,
          targetYear: input.targetYear,
          baseline: input.baseline,
          assumptions: input.assumptions,
        });

        const persisted = await prisma.$transaction(async (tx) => {
          let scenarioId = input.scenarioId ?? null;
          if (scenarioId) {
            const existing = await tx.scenario.findUnique({
              where: { id: scenarioId },
              select: { id: true, organizationId: true },
            });
            if (!existing || existing.organizationId !== organizationId) {
              throw new NotFoundError(`Scenario ${scenarioId} was not found`);
            }
            await tx.scenarioResult.deleteMany({ where: { scenarioId } });
            await tx.scenarioAssumption.deleteMany({ where: { scenarioId } });
          } else {
            const created = await tx.scenario.create({
              data: {
                organizationId,
                name: input.name,
                type: input.type,
                baselineYear: input.baseline.year,
                targetYear: input.targetYear,
                status: "active",
              },
              select: { id: true },
            });
            scenarioId = created.id;
          }

          await tx.scenarioAssumption.createMany({
            data: projection.assumptions.map((assumption) => ({
              scenarioId,
              parameter: assumption.parameter,
              value: assumption.value,
              unit: assumption.unit ?? null,
              category: assumption.category ?? null,
              description: assumption.description ?? null,
              source: assumption.source ?? null,
              confidence: assumption.confidence ?? null,
            })),
          });

          await tx.scenarioResult.createMany({
            data: projection.points.map((point) => ({
              scenarioId,
              year: point.year,
              scope1Emissions: point.scope1Emissions,
              scope2Emissions: point.scope2Emissions,
              scope3Emissions: point.scope3Emissions,
              totalEmissions: point.totalEmissions,
              reductionFromBaseline: point.reductionFromBaseline,
              energyConsumption: point.energyConsumption,
              renewableShare: point.renewableShare,
              costImplication: point.costImplication,
              unit: point.unit,
              metadata: point.metadata as never,
            })),
          });

          return scenarioId;
        });

        return {
          data: summarise(projection, persisted, true),
          message: `Projected ${projection.points.length} year(s): ${(projection.targetReduction * 100).toFixed(1)}% reduction by ${input.targetYear}.`,
          messageKey: "action.success.simulateScenario",
          audit: [
            auditEntry(session, {
              entityType: "Scenario",
              entityId: persisted,
              action: input.scenarioId ? "update" : "create",
              after: {
                name: input.name,
                type: input.type,
                targetYear: input.targetYear,
                targetEmissions: projection.targetEmissions,
                targetReduction: projection.targetReduction,
                levers: projection.levers,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/**
 * Projects a scenario without saving it.
 *
 * Read-only, so it is the one scenario path that still answers in demo mode.
 */
export async function previewScenarioAction(
  rawInput: unknown,
): Promise<ActionState<SimulateScenarioResult>> {
  return runAction(
    {
      name: "previewScenario",
      resource: "scenario",
      action: "read",
      schema: simulateScenarioInputSchema,
      readOnly: true,
      handler: async ({ input }) => {
        const projection = project({
          type: input.type,
          name: input.name,
          targetYear: input.targetYear,
          baseline: input.baseline,
          assumptions: input.assumptions,
        });
        return {
          data: summarise(projection, null, false),
          message: "Projection computed without persisting anything.",
          messageKey: "action.success.previewScenario",
        };
      },
    },
    rawInput,
  );
}

/** Creates a scenario shell with its assumption set but no projection yet. */
export async function createScenarioAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createScenario",
      resource: "scenario",
      action: "create",
      schema: scenarioInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.scenario.create({
          data: {
            organizationId,
            name: input.name,
            description: input.description ?? null,
            type: input.type,
            baselineYear: input.baselineYear,
            targetYear: input.targetYear,
            status: input.status,
            isPublished: input.isPublished,
            assumptions: {
              create: input.assumptions.map((assumption) => ({
                parameter: assumption.parameter,
                value: assumption.value,
                unit: assumption.unit ?? null,
                category: assumption.category ?? null,
                description: assumption.description ?? null,
                source: assumption.source ?? null,
                confidence: assumption.confidence ?? null,
              })),
            },
          },
          select: { id: true },
        });
        return {
          data: { id: created.id },
          message: `Created scenario "${input.name}".`,
          messageKey: "action.success.createScenario",
          audit: [
            auditEntry(session, {
              entityType: "Scenario",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                type: input.type,
                baselineYear: input.baselineYear,
                targetYear: input.targetYear,
                assumptions: input.assumptions.length,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type CompareScenariosResult = {
  readonly records: readonly {
    readonly name: string;
    readonly metric: string;
    readonly scenarioAValue: number | null;
    readonly scenarioBValue: number | null;
    readonly difference: number | null;
    readonly percentChange: number | null;
  }[];
};

/** Compares two stored scenarios and records the comparison. */
export async function compareScenariosAction(
  rawInput: unknown,
): Promise<ActionState<CompareScenariosResult>> {
  return runAction(
    {
      name: "compareScenarios",
      resource: "scenario",
      action: "read",
      schema: compareScenariosInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const scenarios = await prisma.scenario.findMany({
          where: {
            id: { in: [input.scenarioAId, input.scenarioBId] },
            organizationId,
          },
          include: { assumptions: true, results: { orderBy: { year: "asc" } } },
        });
        const a = scenarios.find((row) => row.id === input.scenarioAId);
        const b = scenarios.find((row) => row.id === input.scenarioBId);
        if (!a || !b) {
          throw new NotFoundError("Both scenarios must exist in this organization");
        }

        // Re-project rather than reading the stored rows, so a comparison always
        // reflects the current engine and the stored assumptions together.
        const projectionOf = (scenario: typeof a) => {
          const first = scenario.results[0];
          return projectScenario({
            type: scenario.type,
            name: scenario.name,
            targetYear: scenario.targetYear,
            baseline: {
              year: scenario.baselineYear,
              scope1Emissions: first?.scope1Emissions ?? 0,
              scope2Emissions: first?.scope2Emissions ?? 0,
              scope3Emissions: first?.scope3Emissions ?? 0,
            },
            assumptions: Object.entries(
              leversFrom(scenario.type, scenario.assumptions),
            ).map(([parameter, value]) => ({ parameter, value })),
          });
        };

        const records = compareScenarios(
          { name: a.name, projection: projectionOf(a) },
          { name: b.name, projection: projectionOf(b) },
          input.metrics.length > 0
            ? input.metrics
            : ["totalEmissions", "cumulativeEmissions"],
        );

        const created = await prisma.scenarioComparison.create({
          data: {
            scenarioAId: a.id,
            scenarioBId: b.id,
            name: `${a.name} vs ${b.name}`,
            metric: records.map((record) => record.metric).join(","),
            scenarioAValue: records[0]?.scenarioAValue ?? null,
            scenarioBValue: records[0]?.scenarioBValue ?? null,
            difference: records[0]?.difference ?? null,
            percentChange: records[0]?.percentChange ?? null,
            notes: records.map((record) => record.notes).join("\n"),
          },
          select: { id: true },
        });

        return {
          data: {
            records: records.map((record) => ({
              name: record.name,
              metric: record.metric,
              scenarioAValue: record.scenarioAValue,
              scenarioBValue: record.scenarioBValue,
              difference: record.difference,
              percentChange: record.percentChange,
            })),
          },
          message: `Compared "${a.name}" with "${b.name}" on ${records.length} metric(s).`,
          messageKey: "action.success.compareScenarios",
          audit: [
            auditEntry(session, {
              entityType: "ScenarioComparison",
              entityId: created.id,
              action: "create",
              after: { scenarioAId: a.id, scenarioBId: b.id, metrics: records.length },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type CarbonBudgetResult = {
  readonly id: string;
  readonly remainingBudget: number;
  readonly utilisation: number;
  readonly overshootYear: number | null;
  readonly status: string;
};

/** Creates a carbon budget and reports its consumption against reported actuals. */
export async function createCarbonBudgetAction(
  rawInput: unknown,
): Promise<ActionState<CarbonBudgetResult>> {
  return runAction(
    {
      name: "createCarbonBudget",
      resource: "scenario",
      action: "create",
      schema: carbonBudgetInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.carbonBudget.create({
          data: {
            organizationId,
            name: input.name,
            totalBudget: input.totalBudget,
            usedBudget: input.usedBudget,
            unit: input.unit,
            startYear: input.startYear,
            endYear: input.endYear,
            temperature: input.temperature,
            methodology: input.methodology ?? null,
            status: input.status,
          },
          select: { id: true },
        });

        // No reported years are supplied at creation time, so the consumption
        // report is the opening position: nothing spent, everything remaining.
        const consumption = consumeBudget(
          {
            id: created.id,
            name: input.name,
            totalBudget: input.totalBudget,
            unit: input.unit,
            startYear: input.startYear,
            endYear: input.endYear,
            temperature: input.temperature,
            methodology: input.methodology ?? null,
          },
          [],
        );

        return {
          data: {
            id: created.id,
            remainingBudget: consumption.remainingBudget,
            utilisation: consumption.utilisation,
            overshootYear: consumption.overshootYear,
            status: consumption.status,
          },
          message: `Created budget "${input.name}" with ${consumption.remainingBudget.toFixed(0)} ${input.unit} remaining.`,
          messageKey: "action.success.createCarbonBudget",
          audit: [
            auditEntry(session, {
              entityType: "CarbonBudget",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                totalBudget: input.totalBudget,
                startYear: input.startYear,
                endYear: input.endYear,
                temperature: input.temperature,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
