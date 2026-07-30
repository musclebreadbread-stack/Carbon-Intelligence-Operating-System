/**
 * Demo tenant: scenarios and their assumption rows.
 *
 * Assumptions come straight from `SCENARIO_DEFAULT_LEVERS`, so the fixture and the
 * seeded database describe the same levers, and the projections are produced by
 * `projectScenario` rather than stored as pre-baked series.
 */

import type { ScenarioType } from "@/lib/core/enums";
import { SCENARIO_DEFAULT_LEVERS, SCENARIO_LEVERS } from "@/lib/domain/scenarios/project";

import { DEMO_BASELINE_YEAR, DEMO_CURRENT_YEAR } from "./activity-data";
import { DEMO_ORGANIZATION_ID } from "./organization";
import { DEMO_TARGET_YEAR } from "./targets";

/** Unit and category metadata per lever, for the `ScenarioAssumption` rows. */
const LEVER_META: Readonly<Record<string, { unit: string; category: string }>> = {
  activityGrowthRate: { unit: "fraction/yr", category: "Activity" },
  energyEfficiencyRate: { unit: "fraction/yr", category: "Energy" },
  renewableShareTarget: { unit: "fraction", category: "Energy" },
  fuelSwitchRate: { unit: "fraction/yr", category: "Energy" },
  supplyChainEngagementRate: { unit: "fraction/yr", category: "Supply chain" },
  abatementAmbition: { unit: "fraction", category: "Abatement" },
  residualFloor: { unit: "fraction", category: "Abatement" },
  carbonPrice: { unit: "USD/tCO2e", category: "Carbon price" },
  carbonPriceGrowthRate: { unit: "fraction/yr", category: "Carbon price" },
  abatementCostPerTonne: { unit: "USD/tCO2e", category: "Abatement" },
};

export type DemoScenario = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description: string;
  readonly type: ScenarioType;
  readonly baselineYear: number;
  readonly targetYear: number;
  readonly status: string;
  readonly isPublished: boolean;
};

const SCENARIO_DEFINITIONS: readonly {
  readonly type: ScenarioType;
  readonly name: string;
  readonly description: string;
  readonly published: boolean;
}[] = [
  {
    type: "BASELINE",
    name: "기준 시나리오 (Baseline, frozen efficiency)",
    description: "No change in activity, efficiency or energy mix — the reference case.",
    published: true,
  },
  {
    type: "BAU",
    name: "BAU 시나리오 (Business as usual)",
    description: "Business grows 2.5 %/yr with only incidental efficiency gains.",
    published: true,
  },
  {
    type: "NET_ZERO",
    name: "넷제로 2050 (Net zero by 2050)",
    description: "Full decarbonisation to a 10 % residual, neutralised by durable removals.",
    published: true,
  },
  {
    type: "OPTIMISTIC",
    name: "적극 감축 (Accelerated abatement)",
    description: "All roadmap actions delivered on schedule with an 80 % renewable share.",
    published: true,
  },
  {
    type: "PESSIMISTIC",
    name: "지연 감축 (Delayed action)",
    description: "Capital constraints delay the abatement programme by four years.",
    published: false,
  },
  {
    type: "IEA_NZE",
    name: "IEA NZE 2050",
    description: "Aligned with the IEA Net Zero Emissions by 2050 narrative.",
    published: true,
  },
  {
    type: "IEA_APS",
    name: "IEA APS",
    description: "Aligned with the IEA Announced Pledges Scenario.",
    published: false,
  },
  {
    type: "IEA_STEPS",
    name: "IEA STEPS",
    description: "Aligned with the IEA Stated Policies Scenario.",
    published: false,
  },
];

export const DEMO_SCENARIOS: readonly DemoScenario[] = SCENARIO_DEFINITIONS.map(
  (definition) => ({
    id: `demo-scenario-${definition.type.toLowerCase().replace(/_/g, "-")}`,
    organizationId: DEMO_ORGANIZATION_ID,
    name: definition.name,
    description: definition.description,
    type: definition.type,
    baselineYear: DEMO_CURRENT_YEAR,
    targetYear: definition.type === "NET_ZERO" ? 2050 : DEMO_TARGET_YEAR,
    status: definition.published ? "published" : "draft",
    isPublished: definition.published,
  }),
);

export type DemoScenarioAssumption = {
  readonly id: string;
  readonly scenarioId: string;
  readonly parameter: string;
  readonly value: number;
  readonly unit: string;
  readonly category: string;
  readonly description: string;
  readonly source: string;
  readonly confidence: number;
};

/** One assumption row per lever per scenario, straight from the default set. */
export const DEMO_SCENARIO_ASSUMPTIONS: readonly DemoScenarioAssumption[] =
  DEMO_SCENARIOS.flatMap((scenario) =>
    SCENARIO_LEVERS.map((lever) => {
      const meta = LEVER_META[lever];
      return {
        id: `${scenario.id}-${lever}`,
        scenarioId: scenario.id,
        parameter: lever,
        value: SCENARIO_DEFAULT_LEVERS[scenario.type][lever],
        unit: meta.unit,
        category: meta.category,
        description: `${lever} lever for the ${scenario.type} scenario.`,
        source: "SCENARIO_DEFAULT_LEVERS (src/lib/domain/scenarios/project.ts)",
        confidence: scenario.type.startsWith("IEA_") ? 0.7 : 0.6,
      };
    }),
  );

/** Comparisons the UI renders side by side. */
export type DemoScenarioComparison = {
  readonly id: string;
  readonly scenarioAId: string;
  readonly scenarioBId: string;
  readonly name: string;
};

export const DEMO_SCENARIO_COMPARISONS: readonly DemoScenarioComparison[] = [
  {
    id: "demo-comparison-bau-vs-netzero",
    scenarioAId: "demo-scenario-bau",
    scenarioBId: "demo-scenario-net-zero",
    name: "BAU 대비 넷제로 (BAU versus net zero)",
  },
  {
    id: "demo-comparison-optimistic-vs-pessimistic",
    scenarioAId: "demo-scenario-optimistic",
    scenarioBId: "demo-scenario-pessimistic",
    name: "적극 감축 대비 지연 감축 (Accelerated versus delayed)",
  },
];

export const DEMO_SCENARIO_BASELINE_YEAR = DEMO_CURRENT_YEAR;
export const DEMO_SCENARIO_HISTORY_YEARS = [DEMO_BASELINE_YEAR, DEMO_CURRENT_YEAR] as const;
