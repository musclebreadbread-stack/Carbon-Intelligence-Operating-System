/**
 * Decarbonisation roadmap assembly.
 *
 * Turns a flat list of `RoadmapAction`s into a sequenced plan: one
 * `RoadmapMilestone` per completion year, a cumulative reduction trajectory, and
 * the **residual gap** — the part of the required reduction that no action in the
 * plan accounts for. Surfacing the gap is the point of the exercise: a roadmap
 * whose actions sum to less than its target is not a plan, and the number should
 * be impossible to overlook.
 *
 * Records are shaped to `DecarbonizationRoadmap`, `RoadmapMilestone` and
 * `RoadmapAction`.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { GHGScope } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { safeDivide, sum } from "@/lib/core/number";

export const DEFAULT_ROADMAP_UNIT = "tCO2e";
export const DEFAULT_ROADMAP_CURRENCY = "USD";

/** Action statuses that count as delivered. */
export const COMPLETED_ACTION_STATUSES = ["completed", "verified"] as const;

/** The `RoadmapAction` fields the planner depends on. */
export type RoadmapActionLike = {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly scope?: GHGScope | null;
  /** Higher runs earlier within the same completion year. */
  readonly priority?: number;
  /** Expected annual reduction once fully implemented, in `unit`. */
  readonly expectedReduction: number;
  readonly actualReduction?: number | null;
  readonly unit?: string;
  readonly startDate?: Date | null;
  readonly endDate?: Date | null;
  readonly status?: string;
  readonly owner?: string | null;
  readonly costEstimate?: number | null;
  readonly currency?: string;
  readonly technologyId?: string | null;
};

/** An action with its place in the sequence resolved. */
export type SequencedAction = RoadmapActionLike & {
  /** Year the action is expected to deliver; the roadmap target year if unset. */
  readonly completionYear: number;
  /** True when no `endDate` was supplied and the target year was assumed. */
  readonly completionYearAssumed: boolean;
  readonly sequence: number;
  /** Planned reduction delivered by the end of `completionYear`, inclusive. */
  readonly cumulativeReduction: number;
  readonly costPerTonne: number | null;
  readonly isCompleted: boolean;
};

/** Plain object shaped to the `RoadmapMilestone` model. */
export type RoadmapMilestoneRecord = {
  readonly name: string;
  readonly description: string;
  readonly targetYear: number;
  /** Cumulative planned reduction by the end of the milestone year. */
  readonly targetReduction: number;
  /** Share of that reduction already delivered, as a percentage. */
  readonly currentProgress: number;
  readonly status: string;
  readonly dueDate: Date;
  readonly completedAt: Date | null;
  readonly actionIds: readonly string[];
  /** Reduction the actions in this milestone alone contribute. */
  readonly incrementalReduction: number;
  readonly cost: number;
  readonly unit: string;
};

/** Plain object shaped to the `DecarbonizationRoadmap` model. */
export type RoadmapRecord = {
  readonly name: string;
  readonly description: string | null;
  readonly baselineYear: number;
  readonly targetYear: number;
  readonly baselineEmissions: number;
  readonly targetEmissions: number;
  /** Required reduction as a percentage of the baseline. */
  readonly reductionTarget: number;
  readonly targetType: string;
  readonly status: string;
};

export type RoadmapTrajectoryPoint = {
  readonly year: number;
  /** Straight-line target path from the baseline to the target. */
  readonly targetEmissions: number;
  /** Emissions implied by the actions delivered up to and including this year. */
  readonly plannedEmissions: number;
  readonly cumulativeReduction: number;
  /** Planned minus target: positive means the plan is behind its own target. */
  readonly gapToTarget: number;
};

export type Roadmap = {
  readonly roadmap: RoadmapRecord;
  readonly milestones: readonly RoadmapMilestoneRecord[];
  readonly actions: readonly SequencedAction[];
  readonly trajectory: readonly RoadmapTrajectoryPoint[];
  /** Baseline minus target: the reduction the roadmap has to find. */
  readonly requiredReduction: number;
  /** Sum of every action's expected reduction. */
  readonly plannedReduction: number;
  /** Sum of the reductions actions have actually delivered so far. */
  readonly achievedReduction: number;
  /** `requiredReduction − plannedReduction`; positive means the plan is short. */
  readonly residualGap: number;
  /** The residual gap as a share of the required reduction. */
  readonly residualGapPercent: number;
  readonly isFullyPlanned: boolean;
  readonly totalCost: number;
  readonly averageCostPerTonne: number;
  readonly currency: string;
  readonly unit: string;
  readonly warnings: readonly string[];
};

export type BuildRoadmapInput = {
  readonly name?: string;
  readonly description?: string;
  readonly baseline: { readonly year: number; readonly emissions: number };
  readonly target: {
    readonly year: number;
    /** Absolute target emissions, or `reductionPercent` instead. */
    readonly emissions?: number;
    /** Required reduction as a percentage of the baseline. */
    readonly reductionPercent?: number;
    readonly targetType?: string;
  };
  readonly actions: readonly RoadmapActionLike[];
  readonly unit?: string;
  readonly currency?: string;
};

function isCompleted(action: RoadmapActionLike): boolean {
  const status = (action.status ?? "planned").toLowerCase();
  return (COMPLETED_ACTION_STATUSES as readonly string[]).includes(status);
}

/**
 * Sequences actions into milestones and computes the gap to target.
 *
 * Ordering within a completion year is by descending `priority`, then ascending
 * cost per tonne, then id — cheap, high-priority measures first, and fully
 * deterministic so the same plan always renders the same way.
 */
export function buildRoadmap(input: BuildRoadmapInput): Roadmap {
  const { baseline, target } = input;
  if (!Number.isInteger(baseline.year) || !Number.isInteger(target.year)) {
    throw new CalculationError("Roadmap years must be integers", {
      baselineYear: baseline.year,
      targetYear: target.year,
    });
  }
  if (target.year <= baseline.year) {
    throw new CalculationError("Roadmap target year must be after its baseline year", {
      baselineYear: baseline.year,
      targetYear: target.year,
    });
  }
  if (!Number.isFinite(baseline.emissions) || baseline.emissions <= 0) {
    throw new CalculationError("Roadmap baseline emissions must be greater than zero", {
      baselineEmissions: baseline.emissions,
    });
  }
  if (target.emissions === undefined && target.reductionPercent === undefined) {
    throw new CalculationError(
      "Roadmap target requires either absolute emissions or a reduction percentage",
      {},
    );
  }

  const unit = input.unit ?? DEFAULT_ROADMAP_UNIT;
  const currency = input.currency ?? DEFAULT_ROADMAP_CURRENCY;
  const targetEmissions =
    target.emissions ??
    baseline.emissions * (1 - (target.reductionPercent ?? 0) / 100);
  if (targetEmissions < 0) {
    throw new CalculationError("Roadmap target emissions cannot be negative", {
      targetEmissions,
    });
  }

  const requiredReduction = baseline.emissions - targetEmissions;
  const warnings: string[] = [];

  // --- sequence ----------------------------------------------------------
  const decorated = input.actions.map((action) => {
    if (!Number.isFinite(action.expectedReduction) || action.expectedReduction < 0) {
      throw new CalculationError(
        `Action ${action.id} must declare a non-negative expected reduction`,
        { actionId: action.id, expectedReduction: action.expectedReduction },
      );
    }
    const year = action.endDate?.getUTCFullYear();
    const completionYearAssumed = year === undefined;
    let completionYear = year ?? target.year;
    if (completionYear > target.year) {
      warnings.push(
        `Action "${action.name}" completes in ${completionYear}, after the ${target.year} target year; it is counted in the final milestone.`,
      );
      completionYear = target.year;
    }
    if (completionYear < baseline.year) {
      warnings.push(
        `Action "${action.name}" completes in ${completionYear}, before the ${baseline.year} baseline year; it is counted in the first milestone.`,
      );
      completionYear = baseline.year;
    }
    return {
      action,
      completionYear,
      completionYearAssumed,
      costPerTonne:
        action.costEstimate === undefined ||
        action.costEstimate === null ||
        action.expectedReduction <= 0
          ? null
          : action.costEstimate / action.expectedReduction,
    };
  });

  decorated.sort(
    (a, b) =>
      a.completionYear - b.completionYear ||
      (b.action.priority ?? 0) - (a.action.priority ?? 0) ||
      (a.costPerTonne ?? Number.POSITIVE_INFINITY) -
        (b.costPerTonne ?? Number.POSITIVE_INFINITY) ||
      (a.action.id < b.action.id ? -1 : a.action.id > b.action.id ? 1 : 0),
  );

  let cumulative = 0;
  const actions: SequencedAction[] = decorated.map((entry, index) => {
    cumulative += entry.action.expectedReduction;
    return {
      ...entry.action,
      unit: entry.action.unit ?? unit,
      currency: entry.action.currency ?? currency,
      completionYear: entry.completionYear,
      completionYearAssumed: entry.completionYearAssumed,
      sequence: index + 1,
      cumulativeReduction: cumulative,
      costPerTonne: entry.costPerTonne,
      isCompleted: isCompleted(entry.action),
    };
  });

  const plannedReduction = sum(actions.map((action) => action.expectedReduction));
  const achievedReduction = sum(
    actions.map((action) => action.actualReduction ?? (action.isCompleted ? action.expectedReduction : 0)),
  );
  const residualGap = requiredReduction - plannedReduction;

  if (residualGap > 1e-9) {
    warnings.push(
      `The plan is ${residualGap.toPrecision(4)} ${unit} short of the ${requiredReduction.toPrecision(4)} ${unit} reduction the target requires.`,
    );
  }
  if (actions.some((action) => action.completionYearAssumed)) {
    warnings.push(
      `${actions.filter((action) => action.completionYearAssumed).length} action(s) have no end date and were assigned to the ${target.year} milestone.`,
    );
  }

  // --- milestones --------------------------------------------------------
  const byYear = new Map<number, SequencedAction[]>();
  for (const action of actions) {
    const bucket = byYear.get(action.completionYear);
    if (bucket) bucket.push(action);
    else byYear.set(action.completionYear, [action]);
  }

  let cumulativeByMilestone = 0;
  const milestones: RoadmapMilestoneRecord[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, group]) => {
      const incrementalReduction = sum(group.map((action) => action.expectedReduction));
      cumulativeByMilestone += incrementalReduction;
      const delivered = sum(
        group.map(
          (action) => action.actualReduction ?? (action.isCompleted ? action.expectedReduction : 0),
        ),
      );
      const allCompleted = group.every((action) => action.isCompleted);
      const anyCompleted = group.some((action) => action.isCompleted);
      return {
        name: `${year} milestone`,
        description: `${group.length} action(s) delivering ${incrementalReduction.toPrecision(4)} ${unit} in ${year}`,
        targetYear: year,
        targetReduction: cumulativeByMilestone,
        currentProgress: safeDivide(delivered, incrementalReduction) * 100,
        status: allCompleted ? "completed" : anyCompleted ? "in_progress" : "pending",
        dueDate: new Date(Date.UTC(year, 11, 31)),
        completedAt: allCompleted ? new Date(Date.UTC(year, 11, 31)) : null,
        actionIds: group.map((action) => action.id),
        incrementalReduction,
        cost: sum(group.map((action) => action.costEstimate ?? 0)),
        unit,
      };
    });

  // --- trajectory --------------------------------------------------------
  const span = target.year - baseline.year;
  const trajectory: RoadmapTrajectoryPoint[] = [];
  for (let year = baseline.year; year <= target.year; year += 1) {
    const cumulativeReduction = sum(
      actions
        .filter((action) => action.completionYear <= year)
        .map((action) => action.expectedReduction),
    );
    const targetPath =
      baseline.emissions - (requiredReduction * (year - baseline.year)) / span;
    const plannedEmissions = baseline.emissions - cumulativeReduction;
    trajectory.push({
      year,
      targetEmissions: targetPath,
      plannedEmissions,
      cumulativeReduction,
      gapToTarget: plannedEmissions - targetPath,
    });
  }

  const totalCost = sum(actions.map((action) => action.costEstimate ?? 0));

  return {
    roadmap: {
      name: input.name ?? `Decarbonisation roadmap ${baseline.year}–${target.year}`,
      description: input.description ?? null,
      baselineYear: baseline.year,
      targetYear: target.year,
      baselineEmissions: baseline.emissions,
      targetEmissions,
      reductionTarget: safeDivide(requiredReduction, baseline.emissions) * 100,
      targetType: target.targetType ?? "absolute",
      status: residualGap > 1e-9 ? "draft" : "planned",
    },
    milestones,
    actions,
    trajectory,
    requiredReduction,
    plannedReduction,
    achievedReduction,
    residualGap,
    residualGapPercent: safeDivide(residualGap, requiredReduction) * 100,
    isFullyPlanned: residualGap <= 1e-9,
    totalCost,
    averageCostPerTonne: safeDivide(totalCost, plannedReduction),
    currency,
    unit,
    warnings,
  };
}
