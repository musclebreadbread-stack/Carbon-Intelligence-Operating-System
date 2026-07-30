/**
 * GWP normalisation: converts a per-gas mass breakdown into CO2 equivalent.
 *
 * Biogenic CO2 is tracked separately and excluded from `totalCO2e`, per the GHG
 * Protocol Corporate Standard (biomass CO2 is reported outside the scopes).
 * Biogenic *methane* is not excluded — only the CO2 from biomass oxidation is.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { GwpVersion } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import {
  GWP_TABLE,
  isGreenhouseGas,
  type GasColumn,
  type GreenhouseGas,
} from "@/lib/reference/gwp";

/** Mass of each gas, in the same mass unit throughout (typically tonnes). */
export type GasMasses = Readonly<Partial<Record<GreenhouseGas, number>>>;

export type GasContribution = {
  readonly gas: GreenhouseGas;
  readonly mass: number;
  readonly gwp: number;
  readonly co2e: number;
  readonly column: GasColumn;
};

export type Co2eBreakdown = {
  /** Sum of all non-biogenic-CO2 contributions. */
  readonly totalCO2e: number;
  readonly byGas: readonly GasContribution[];
  /** Biogenic CO2 mass, reported separately and NOT included in `totalCO2e`. */
  readonly biogenicCO2: number;
  /** Totals mapped onto the `EmissionResult` gas columns. */
  readonly byColumn: Readonly<Record<GasColumn, number>>;
  readonly gwpVersion: GwpVersion;
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

/**
 * Converts a gas breakdown to CO2e.
 *
 * `byColumn` carries the CO2e contribution of each `EmissionResult` gas column,
 * so a result row can be populated directly from the return value.
 */
export function gasesToCo2e(gases: GasMasses, gwpVersion: GwpVersion): Co2eBreakdown {
  const byGas: GasContribution[] = [];
  const byColumn: Record<GasColumn, number> = { ...EMPTY_COLUMNS };
  let totalCO2e = 0;
  let biogenicCO2 = 0;

  for (const [key, mass] of Object.entries(gases)) {
    if (mass === undefined) continue;
    if (!isGreenhouseGas(key)) {
      throw new CalculationError(`Unknown greenhouse gas: ${key}`, { gas: key });
    }
    if (!Number.isFinite(mass)) {
      throw new CalculationError(`Non-finite mass for gas ${key}`, { gas: key, mass });
    }

    const entry = GWP_TABLE[key];
    const gwp = entry.gwp[gwpVersion];
    const co2e = mass * gwp;

    byGas.push({ gas: key, mass, gwp, co2e, column: entry.column });

    if (entry.isBiogenic) {
      // Reported outside the scope totals; its GWP is 0 so it adds nothing.
      biogenicCO2 += mass;
      continue;
    }

    totalCO2e += co2e;
    byColumn[entry.column] += co2e;
  }

  return { totalCO2e, byGas, biogenicCO2, byColumn, gwpVersion };
}

/** Adds two breakdowns computed under the same GWP version. */
export function mergeCo2e(a: Co2eBreakdown, b: Co2eBreakdown): Co2eBreakdown {
  if (a.gwpVersion !== b.gwpVersion) {
    throw new CalculationError("Cannot merge breakdowns with different GWP versions", {
      a: a.gwpVersion,
      b: b.gwpVersion,
    });
  }
  const byColumn: Record<GasColumn, number> = { ...EMPTY_COLUMNS };
  for (const column of Object.keys(EMPTY_COLUMNS) as GasColumn[]) {
    byColumn[column] = a.byColumn[column] + b.byColumn[column];
  }
  return {
    totalCO2e: a.totalCO2e + b.totalCO2e,
    byGas: [...a.byGas, ...b.byGas],
    biogenicCO2: a.biogenicCO2 + b.biogenicCO2,
    byColumn,
    gwpVersion: a.gwpVersion,
  };
}

/** Convenience breakdown for a factor already expressed in CO2e. */
export function co2eOnly(co2e: number, gwpVersion: GwpVersion): Co2eBreakdown {
  return gasesToCo2e({ CO2: co2e }, gwpVersion);
}
