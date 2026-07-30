/**
 * Shared result and trace types for every emission engine.
 *
 * Conventions:
 *  - Emission factors are expressed in **kg** of gas (or kg CO2e) per activity
 *    unit, matching the `EmissionFactorUnit` enum.
 *  - Engines accumulate in kg internally and report in **tCO2e**, matching the
 *    `EmissionResult.unit` default.
 *  - `GasBreakdown` is shaped to the `EmissionResult` gas columns so a result row
 *    can be written straight from it.
 *  - Every engine emits an `EmissionCalcTrace`: an ordered list of steps shaped to
 *    the `CalculationTrace` model, so the calculation is explainable end to end.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { GHGScope, GwpVersion, Scope3Category } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { GWP_TABLE, type GasColumn, type GreenhouseGas } from "@/lib/reference/gwp";

import type { GasContribution, GasMasses } from "../gwp/to-co2e";

export const KG_PER_TONNE = 1000;
export const DEFAULT_EMISSION_UNIT = "tCO2e";

/** One step of a calculation, shaped to the `CalculationTrace` model. */
export type EmissionCalcTraceStep = {
  readonly stepName: string;
  readonly formula: string;
  readonly inputs: Readonly<Record<string, number | string | boolean | null>>;
  readonly output: number;
  readonly unit: string;
  readonly notes?: string;
  readonly orderIndex: number;
};

export type EmissionCalcTrace = readonly EmissionCalcTraceStep[];

/** Accumulates trace steps with a monotonically increasing `orderIndex`. */
export class TraceBuilder {
  private readonly steps: EmissionCalcTraceStep[] = [];

  add(step: Omit<EmissionCalcTraceStep, "orderIndex">): this {
    this.steps.push({ ...step, orderIndex: this.steps.length });
    return this;
  }

  /** Appends steps from another trace, renumbering them. */
  merge(trace: EmissionCalcTrace, prefix?: string): this {
    for (const step of trace) {
      this.add({
        ...step,
        stepName: prefix ? `${prefix}: ${step.stepName}` : step.stepName,
      });
    }
    return this;
  }

  build(): EmissionCalcTrace {
    return [...this.steps];
  }
}

export function createTrace(): TraceBuilder {
  return new TraceBuilder();
}

/** Per-gas result, shaped to the `EmissionResult` gas columns (in tCO2e). */
export type GasBreakdown = {
  readonly co2Emissions: number;
  readonly ch4Emissions: number;
  readonly n2oEmissions: number;
  readonly hfcEmissions: number;
  readonly pfcEmissions: number;
  readonly sf6Emissions: number;
  readonly nf3Emissions: number;
  /** Total CO2e excluding biogenic CO2. */
  readonly totalCO2e: number;
  /** Biogenic CO2 in tonnes, reported outside the scope totals. */
  readonly biogenicCO2: number;
  readonly unit: string;
  readonly gwpVersion: GwpVersion;
  readonly byGas: readonly GasContribution[];
};

const EMPTY_COLUMNS: Readonly<Record<GasColumn, number>> = {
  co2Emissions: 0,
  ch4Emissions: 0,
  n2oEmissions: 0,
  hfcEmissions: 0,
  pfcEmissions: 0,
  sf6Emissions: 0,
  nf3Emissions: 0,
};

export type BuildGasBreakdownInput = {
  /** kg of each gas emitted (mass, not CO2e). */
  readonly perGasKg?: GasMasses;
  /**
   * kg CO2e already aggregated by the factor publisher. Added to `totalCO2e`
   * without attribution to a gas column, because the constituent gases are
   * unknown.
   */
  readonly aggregateCo2eKg?: number;
  /** kg of biomass-derived CO2, reported separately. */
  readonly biogenicCo2Kg?: number;
  readonly gwpVersion: GwpVersion;
};

/** Converts kg-denominated gas masses into a tCO2e `GasBreakdown`. */
export function buildGasBreakdown(input: BuildGasBreakdownInput): GasBreakdown {
  const columns: Record<GasColumn, number> = { ...EMPTY_COLUMNS };
  const byGas: GasContribution[] = [];
  let totalCo2eKg = input.aggregateCo2eKg ?? 0;

  if (!Number.isFinite(totalCo2eKg)) {
    throw new CalculationError("Non-finite aggregate CO2e", {
      aggregateCo2eKg: input.aggregateCo2eKg,
    });
  }

  for (const [key, massKg] of Object.entries(input.perGasKg ?? {})) {
    if (massKg === undefined) continue;
    const entry = GWP_TABLE[key as GreenhouseGas];
    if (!entry) {
      throw new CalculationError(`Unknown greenhouse gas: ${key}`, { gas: key });
    }
    if (!Number.isFinite(massKg)) {
      throw new CalculationError(`Non-finite mass for gas ${key}`, { gas: key, massKg });
    }
    const gwp = entry.gwp[input.gwpVersion];
    const co2eKg = massKg * gwp;
    byGas.push({
      gas: key as GreenhouseGas,
      mass: massKg / KG_PER_TONNE,
      gwp,
      co2e: co2eKg / KG_PER_TONNE,
      column: entry.column,
    });
    if (entry.isBiogenic) continue;
    columns[entry.column] += co2eKg;
    totalCo2eKg += co2eKg;
  }

  const biogenicKg =
    (input.biogenicCo2Kg ?? 0) +
    (input.perGasKg?.CO2_BIOGENIC !== undefined ? input.perGasKg.CO2_BIOGENIC : 0);

  return {
    co2Emissions: columns.co2Emissions / KG_PER_TONNE,
    ch4Emissions: columns.ch4Emissions / KG_PER_TONNE,
    n2oEmissions: columns.n2oEmissions / KG_PER_TONNE,
    hfcEmissions: columns.hfcEmissions / KG_PER_TONNE,
    pfcEmissions: columns.pfcEmissions / KG_PER_TONNE,
    sf6Emissions: columns.sf6Emissions / KG_PER_TONNE,
    nf3Emissions: columns.nf3Emissions / KG_PER_TONNE,
    totalCO2e: totalCo2eKg / KG_PER_TONNE,
    biogenicCO2: biogenicKg / KG_PER_TONNE,
    unit: DEFAULT_EMISSION_UNIT,
    gwpVersion: input.gwpVersion,
    byGas,
  };
}

export const ZERO_GAS_BREAKDOWN = (gwpVersion: GwpVersion): GasBreakdown =>
  buildGasBreakdown({ gwpVersion });

/** Adds two breakdowns computed under the same GWP version. */
export function addGasBreakdowns(a: GasBreakdown, b: GasBreakdown): GasBreakdown {
  if (a.gwpVersion !== b.gwpVersion) {
    throw new CalculationError("Cannot add breakdowns with different GWP versions", {
      a: a.gwpVersion,
      b: b.gwpVersion,
    });
  }
  return {
    co2Emissions: a.co2Emissions + b.co2Emissions,
    ch4Emissions: a.ch4Emissions + b.ch4Emissions,
    n2oEmissions: a.n2oEmissions + b.n2oEmissions,
    hfcEmissions: a.hfcEmissions + b.hfcEmissions,
    pfcEmissions: a.pfcEmissions + b.pfcEmissions,
    sf6Emissions: a.sf6Emissions + b.sf6Emissions,
    nf3Emissions: a.nf3Emissions + b.nf3Emissions,
    totalCO2e: a.totalCO2e + b.totalCO2e,
    biogenicCO2: a.biogenicCO2 + b.biogenicCO2,
    unit: a.unit,
    gwpVersion: a.gwpVersion,
    byGas: [...a.byGas, ...b.byGas],
  };
}

/** Scales a breakdown by a dimensionless factor, e.g. an equity share. */
export function scaleGasBreakdown(breakdown: GasBreakdown, factor: number): GasBreakdown {
  if (!Number.isFinite(factor)) {
    throw new CalculationError("Cannot scale by a non-finite factor", { factor });
  }
  return {
    co2Emissions: breakdown.co2Emissions * factor,
    ch4Emissions: breakdown.ch4Emissions * factor,
    n2oEmissions: breakdown.n2oEmissions * factor,
    hfcEmissions: breakdown.hfcEmissions * factor,
    pfcEmissions: breakdown.pfcEmissions * factor,
    sf6Emissions: breakdown.sf6Emissions * factor,
    nf3Emissions: breakdown.nf3Emissions * factor,
    totalCO2e: breakdown.totalCO2e * factor,
    biogenicCO2: breakdown.biogenicCO2 * factor,
    unit: breakdown.unit,
    gwpVersion: breakdown.gwpVersion,
    byGas: breakdown.byGas.map((contribution) => ({
      ...contribution,
      mass: contribution.mass * factor,
      co2e: contribution.co2e * factor,
    })),
  };
}

/**
 * Emission factors for one activity, expressed per `denominatorUnit`.
 *
 * Use `perGasKg` for factors published per gas (the IPCC/DEFRA style, which
 * lets the engine apply the chosen GWP vintage), and `co2eKgPerUnit` for factors
 * the publisher has already aggregated to CO2e (grid factors, spend-based EEIO
 * factors). Both may be present.
 */
export type ActivityFactorSet = {
  readonly denominatorUnit: string;
  readonly perGasKg?: GasMasses;
  readonly co2eKgPerUnit?: number;
  readonly factorId?: string | null;
  readonly factorName?: string | null;
  /** Relative uncertainty of the factor, as a fraction (0.05 = ±5 %). */
  readonly uncertainty?: number | null;
  /** Fraction of the CO2 that is biomass-derived and reported separately (0..1). */
  readonly biogenicFraction?: number;
};

/** What every engine function returns. */
export type EmissionComputation = {
  readonly gases: GasBreakdown;
  readonly trace: EmissionCalcTrace;
  readonly scope: GHGScope;
  readonly scope3Category?: Scope3Category | null;
  /** Method label recorded on the calculation, e.g. `"stationary-combustion"`. */
  readonly method: string;
  readonly factorId?: string | null;
  /** Relative uncertainty of the emission factor used, as a fraction. */
  readonly factorUncertainty?: number | null;
};
