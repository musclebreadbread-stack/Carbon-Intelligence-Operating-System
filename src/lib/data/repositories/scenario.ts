/**
 * Scenario repository.
 *
 * Projections are produced by `projectScenario` from the stored assumption rows and
 * the calculated baseline inventory, so a scenario is a *definition* in the database
 * and a *computation* at read time. Nothing pre-baked is stored or displayed.
 */

import type { ScenarioType } from "@/lib/core/enums";
import { consumeBudget } from "@/lib/domain/scenarios/budget";
import {
  compareScenarios,
  projectScenario,
  SCENARIO_DEFAULT_LEVERS,
  type LeverSet,
  type ScenarioLever,
  type ScenarioProjection,
} from "@/lib/domain/scenarios/project";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_BASELINE_YEAR,
  DEMO_CURRENT_YEAR,
  DEMO_SCENARIOS,
  DEMO_SCENARIO_ASSUMPTIONS,
  DEMO_SCENARIO_COMPARISONS,
  type DemoScenario,
  type DemoScenarioAssumption,
} from "../demo";

import { getInventory } from "./calculation";
import { getCarbonBudget } from "./targets";

export type ScenarioRow = DemoScenario & {
  readonly assumptions: readonly DemoScenarioAssumption[];
};

export async function listScenarios(
  organizationId: string,
): Promise<readonly ScenarioRow[]> {
  return withDb<readonly ScenarioRow[]>(
    async () => {
      const rows = await prisma.scenario.findMany({
        where: { organizationId },
        orderBy: [{ type: "asc" }, { name: "asc" }],
        include: { assumptions: { orderBy: { parameter: "asc" } } },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        description: row.description ?? "",
        type: row.type,
        baselineYear: row.baselineYear,
        targetYear: row.targetYear,
        status: row.status,
        isPublished: row.isPublished,
        assumptions: row.assumptions.map((assumption) => ({
          id: assumption.id,
          scenarioId: assumption.scenarioId,
          parameter: assumption.parameter,
          value: assumption.value,
          unit: assumption.unit ?? "",
          category: assumption.category ?? "",
          description: assumption.description ?? "",
          source: assumption.source ?? "",
          confidence: assumption.confidence ?? 0,
        })),
      }));
    },
    () =>
      DEMO_SCENARIOS.filter((scenario) => scenario.organizationId === organizationId).map(
        (scenario) => ({
          ...scenario,
          assumptions: DEMO_SCENARIO_ASSUMPTIONS.filter(
            (assumption) => assumption.scenarioId === scenario.id,
          ),
        }),
      ),
  );
}

/** Builds the lever set from the stored assumption rows, defaulting per type. */
export function leversFrom(
  type: ScenarioType,
  assumptions: readonly { readonly parameter: string; readonly value: number }[],
): LeverSet {
  const levers: Record<string, number> = { ...SCENARIO_DEFAULT_LEVERS[type] };
  for (const assumption of assumptions) {
    if (assumption.parameter in levers) {
      levers[assumption.parameter as ScenarioLever] = assumption.value;
    }
  }
  return levers as LeverSet;
}

export type ScenarioProjectionView = {
  readonly scenario: ScenarioRow;
  readonly projection: ScenarioProjection;
};

export async function getScenarioProjection(
  organizationId: string,
  scenarioId: string,
): Promise<ScenarioProjectionView | null> {
  const scenarios = await listScenarios(organizationId);
  const scenario = scenarios.find((row) => row.id === scenarioId);
  if (!scenario) return null;

  const inventory = await getInventory(organizationId, scenario.baselineYear);
  const projection = projectScenario({
    type: scenario.type,
    baseline: {
      year: scenario.baselineYear,
      scope1Emissions: inventory.totals.scope1Total,
      scope2Emissions: inventory.totals.scope2Location,
      scope3Emissions: inventory.totals.scope3Total,
    },
    assumptions: scenario.assumptions,
    targetYear: scenario.targetYear,
    name: scenario.name,
  });

  return { scenario, projection };
}

/** Every published scenario, projected — the simulator's default view. */
export async function listScenarioProjections(
  organizationId: string,
): Promise<readonly ScenarioProjectionView[]> {
  const scenarios = await listScenarios(organizationId);
  const inventory = await getInventory(organizationId, DEMO_CURRENT_YEAR);
  return scenarios.map((scenario) => ({
    scenario,
    projection: projectScenario({
      type: scenario.type,
      baseline: {
        year: scenario.baselineYear,
        scope1Emissions: inventory.totals.scope1Total,
        scope2Emissions: inventory.totals.scope2Location,
        scope3Emissions: inventory.totals.scope3Total,
      },
      assumptions: scenario.assumptions,
      targetYear: scenario.targetYear,
      name: scenario.name,
    }),
  }));
}

export async function getScenarioComparison(
  organizationId: string,
  comparisonId: string,
) {
  const comparison = DEMO_SCENARIO_COMPARISONS.find((row) => row.id === comparisonId);
  if (!comparison) return null;
  const [a, b] = await Promise.all([
    getScenarioProjection(organizationId, comparison.scenarioAId),
    getScenarioProjection(organizationId, comparison.scenarioBId),
  ]);
  if (!a || !b) return null;
  return {
    id: comparison.id,
    name: comparison.name,
    comparison: compareScenarios(
      { name: a.scenario.name, projection: a.projection },
      { name: b.scenario.name, projection: b.projection },
    ),
  };
}

export const DEMO_SCENARIO_COMPARISON_LIST = DEMO_SCENARIO_COMPARISONS;

/** Carbon-budget consumption against the calculated actuals. */
export async function getBudgetConsumption(organizationId: string) {
  const budget = await getCarbonBudget(organizationId);
  if (!budget) return null;
  const years = [DEMO_BASELINE_YEAR, DEMO_CURRENT_YEAR];
  const actuals = await Promise.all(
    years.map(async (year) => {
      const inventory = await getInventory(organizationId, year);
      return { year, emissions: inventory.totals.totalEmissions };
    }),
  );
  return {
    budget,
    consumption: consumeBudget(
      {
        totalBudget: budget.totalBudget,
        startYear: budget.startYear,
        endYear: budget.endYear,
        unit: budget.unit,
      },
      actuals,
    ),
  };
}
