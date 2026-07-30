/**
 * IPCC 100-year Global Warming Potentials (GWP-100).
 *
 * Sources:
 *  - AR4 (2007) WG1 Table 2.14
 *  - AR5 (2013) WG1 Table 8.A.1, values *without* climate-carbon feedbacks
 *  - AR6 (2021) WG1 Table 7.SM.7
 *
 * CH4 is carried three ways because AR5/AR6 differentiate the oxidation of
 * fossil carbon from biogenic carbon:
 *  - `CH4`          the generic reported value (AR5 28, AR6 27.9)
 *  - `CH4_FOSSIL`   fossil-origin methane (AR5 30, AR6 29.8)
 *  - `CH4_BIOGENIC` non-fossil methane (AR5 28, AR6 27.0)
 *
 * `biogenicCO2` is deliberately assigned a GWP of 0: under the GHG Protocol,
 * CO2 from biomass combustion is reported separately and excluded from the
 * scope totals. See `src/lib/domain/gwp/to-co2e.ts`.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import type { GwpVersion } from "@/lib/core/enums";

/** Column of `EmissionResult` a gas species rolls up into. */
export type GasColumn =
  | "co2Emissions"
  | "ch4Emissions"
  | "n2oEmissions"
  | "hfcEmissions"
  | "pfcEmissions"
  | "sf6Emissions"
  | "nf3Emissions";

export const GREENHOUSE_GASES = [
  "CO2",
  "CO2_BIOGENIC",
  "CH4",
  "CH4_FOSSIL",
  "CH4_BIOGENIC",
  "N2O",
  "HFC_23",
  "HFC_32",
  "HFC_125",
  "HFC_134A",
  "HFC_143A",
  "HFC_152A",
  "HFC_227EA",
  "HFC_236FA",
  "HFC_245FA",
  "PFC_14",
  "PFC_116",
  "PFC_218",
  "PFC_318",
  "SF6",
  "NF3",
] as const;
export type GreenhouseGas = (typeof GREENHOUSE_GASES)[number];

export type GwpEntry = {
  readonly gas: GreenhouseGas;
  /** Human-readable species name, e.g. "HFC-134a". */
  readonly label: string;
  /** `EmissionResult` column this species aggregates into. */
  readonly column: GasColumn;
  /** True for biomass-derived CO2, which is reported outside the scope totals. */
  readonly isBiogenic: boolean;
  readonly gwp: Readonly<Record<GwpVersion, number>>;
};

export const GWP_TABLE: Readonly<Record<GreenhouseGas, GwpEntry>> = {
  CO2: {
    gas: "CO2",
    label: "Carbon dioxide",
    column: "co2Emissions",
    isBiogenic: false,
    gwp: { AR4: 1, AR5: 1, AR6: 1 },
  },
  CO2_BIOGENIC: {
    gas: "CO2_BIOGENIC",
    label: "Carbon dioxide (biogenic)",
    column: "co2Emissions",
    isBiogenic: true,
    gwp: { AR4: 0, AR5: 0, AR6: 0 },
  },
  CH4: {
    gas: "CH4",
    label: "Methane",
    column: "ch4Emissions",
    isBiogenic: false,
    gwp: { AR4: 25, AR5: 28, AR6: 27.9 },
  },
  CH4_FOSSIL: {
    gas: "CH4_FOSSIL",
    label: "Methane (fossil)",
    column: "ch4Emissions",
    isBiogenic: false,
    gwp: { AR4: 25, AR5: 30, AR6: 29.8 },
  },
  CH4_BIOGENIC: {
    gas: "CH4_BIOGENIC",
    label: "Methane (non-fossil)",
    column: "ch4Emissions",
    isBiogenic: false,
    gwp: { AR4: 25, AR5: 28, AR6: 27 },
  },
  N2O: {
    gas: "N2O",
    label: "Nitrous oxide",
    column: "n2oEmissions",
    isBiogenic: false,
    gwp: { AR4: 298, AR5: 265, AR6: 273 },
  },
  HFC_23: {
    gas: "HFC_23",
    label: "HFC-23",
    column: "hfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 14800, AR5: 12400, AR6: 14600 },
  },
  HFC_32: {
    gas: "HFC_32",
    label: "HFC-32",
    column: "hfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 675, AR5: 677, AR6: 771 },
  },
  HFC_125: {
    gas: "HFC_125",
    label: "HFC-125",
    column: "hfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 3500, AR5: 3170, AR6: 3740 },
  },
  HFC_134A: {
    gas: "HFC_134A",
    label: "HFC-134a",
    column: "hfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 1430, AR5: 1300, AR6: 1530 },
  },
  HFC_143A: {
    gas: "HFC_143A",
    label: "HFC-143a",
    column: "hfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 4470, AR5: 4800, AR6: 5810 },
  },
  HFC_152A: {
    gas: "HFC_152A",
    label: "HFC-152a",
    column: "hfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 124, AR5: 138, AR6: 164 },
  },
  HFC_227EA: {
    gas: "HFC_227EA",
    label: "HFC-227ea",
    column: "hfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 3220, AR5: 3350, AR6: 3600 },
  },
  HFC_236FA: {
    gas: "HFC_236FA",
    label: "HFC-236fa",
    column: "hfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 9810, AR5: 8060, AR6: 8690 },
  },
  HFC_245FA: {
    gas: "HFC_245FA",
    label: "HFC-245fa",
    column: "hfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 1030, AR5: 858, AR6: 962 },
  },
  PFC_14: {
    gas: "PFC_14",
    label: "PFC-14 (CF4)",
    column: "pfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 7390, AR5: 6630, AR6: 7380 },
  },
  PFC_116: {
    gas: "PFC_116",
    label: "PFC-116 (C2F6)",
    column: "pfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 12200, AR5: 11100, AR6: 12400 },
  },
  PFC_218: {
    gas: "PFC_218",
    label: "PFC-218 (C3F8)",
    column: "pfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 8830, AR5: 8900, AR6: 9290 },
  },
  PFC_318: {
    gas: "PFC_318",
    label: "PFC-318 (c-C4F8)",
    column: "pfcEmissions",
    isBiogenic: false,
    gwp: { AR4: 10300, AR5: 9540, AR6: 10200 },
  },
  SF6: {
    gas: "SF6",
    label: "Sulphur hexafluoride",
    column: "sf6Emissions",
    isBiogenic: false,
    gwp: { AR4: 22800, AR5: 23500, AR6: 25200 },
  },
  NF3: {
    gas: "NF3",
    label: "Nitrogen trifluoride",
    column: "nf3Emissions",
    isBiogenic: false,
    gwp: { AR4: 17200, AR5: 16100, AR6: 17400 },
  },
};

/** GWP-100 for a gas under a given assessment report. */
export function gwpOf(gas: GreenhouseGas, version: GwpVersion): number {
  const entry = GWP_TABLE[gas];
  if (!entry) {
    throw new CalculationError(`Unknown greenhouse gas: ${gas}`, { gas });
  }
  return entry.gwp[version];
}

export function isGreenhouseGas(value: string): value is GreenhouseGas {
  return Object.prototype.hasOwnProperty.call(GWP_TABLE, value);
}

/**
 * Refrigerant blends encountered in fugitive-emission screening, expressed as
 * the mass fraction of each constituent species (fractions sum to 1).
 */
export const REFRIGERANT_BLENDS: Readonly<
  Record<string, Readonly<Partial<Record<GreenhouseGas, number>>>>
> = {
  "R-134a": { HFC_134A: 1 },
  "R-32": { HFC_32: 1 },
  "R-23": { HFC_23: 1 },
  "R-404A": { HFC_125: 0.44, HFC_143A: 0.52, HFC_134A: 0.04 },
  "R-407C": { HFC_32: 0.23, HFC_125: 0.25, HFC_134A: 0.52 },
  "R-410A": { HFC_32: 0.5, HFC_125: 0.5 },
  "R-507A": { HFC_125: 0.5, HFC_143A: 0.5 },
  SF6: { SF6: 1 },
  NF3: { NF3: 1 },
};

/** Blended GWP-100 of a refrigerant, mass-weighted across its constituents. */
export function blendGwp(blend: string, version: GwpVersion): number {
  const composition = REFRIGERANT_BLENDS[blend];
  if (!composition) {
    throw new CalculationError(`Unknown refrigerant blend: ${blend}`, { blend });
  }
  return Object.entries(composition).reduce(
    (total, [gas, fraction]) => total + gwpOf(gas as GreenhouseGas, version) * (fraction ?? 0),
    0,
  );
}
