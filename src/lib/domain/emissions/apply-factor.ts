/**
 * The shared calculation kernel: activity data × emission factor → CO2e.
 *
 * Every scope engine funnels through here so that unit normalisation, GWP
 * application, biogenic-carbon separation and trace generation behave
 * identically no matter which scope is being calculated.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { GwpVersion } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { GWP_TABLE, type GreenhouseGas } from "@/lib/reference/gwp";

import type { GasMasses } from "../gwp/to-co2e";
import { convert, conversionFactor } from "../units/convert";
import {
  KG_PER_TONNE,
  TraceBuilder,
  buildGasBreakdown,
  createTrace,
  type ActivityFactorSet,
  type EmissionCalcTrace,
  type GasBreakdown,
} from "./types";

export type ApplyFactorInput = {
  /** Activity quantity, e.g. litres of diesel or kWh of electricity. */
  readonly quantity: number;
  /** Unit the quantity is recorded in; converted to the factor's denominator. */
  readonly unit: string;
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  /** Label used in the trace step names, e.g. `"Diesel (stationary)"`. */
  readonly label?: string;
  /** Reusable trace builder, so a caller can prepend its own steps. */
  readonly trace?: TraceBuilder;
};

export type ApplyFactorResult = {
  readonly gases: GasBreakdown;
  readonly trace: EmissionCalcTrace;
  /** Activity quantity expressed in the factor's denominator unit. */
  readonly normalizedQuantity: number;
};

/**
 * Multiplies an activity quantity by a factor set and applies GWP.
 *
 * Ordering of the emitted trace steps:
 *  1. unit normalisation (skipped when the units already match)
 *  2. one step per gas mass
 *  3. biogenic split, when a biogenic fraction is declared
 *  4. one step per gas CO2e conversion
 *  5. the pre-aggregated CO2e factor, when present
 *  6. the total
 */
export function applyFactorSet(input: ApplyFactorInput): ApplyFactorResult {
  const { quantity, unit, factors, gwpVersion } = input;
  const label = input.label ?? "activity";

  if (!Number.isFinite(quantity)) {
    throw new CalculationError("Activity quantity must be a finite number", {
      quantity,
      unit,
      label,
    });
  }
  if (factors.perGasKg === undefined && factors.co2eKgPerUnit === undefined) {
    throw new CalculationError(
      `Factor set for ${label} declares neither per-gas factors nor a CO2e factor`,
      { label, denominatorUnit: factors.denominatorUnit },
    );
  }
  const biogenicFraction = factors.biogenicFraction ?? 0;
  if (biogenicFraction < 0 || biogenicFraction > 1) {
    throw new CalculationError("biogenicFraction must be between 0 and 1", {
      biogenicFraction,
      label,
    });
  }

  const trace = input.trace ?? createTrace();
  const normalizedQuantity = convert(quantity, unit, factors.denominatorUnit);

  if (normalizedQuantity !== quantity || unit !== factors.denominatorUnit) {
    trace.add({
      stepName: `${label}: normalise activity unit`,
      formula: `quantity × conversionFactor(${unit} → ${factors.denominatorUnit})`,
      inputs: {
        quantity,
        fromUnit: unit,
        toUnit: factors.denominatorUnit,
        conversionFactor: conversionFactor(unit, factors.denominatorUnit),
      },
      output: normalizedQuantity,
      unit: factors.denominatorUnit,
    });
  }

  // Step 2/3: gas masses, with the biogenic CO2 split out.
  const perGasKg: Record<string, number> = {};
  let biogenicCo2Kg = 0;

  for (const [gas, factorValue] of Object.entries(factors.perGasKg ?? {})) {
    if (factorValue === undefined) continue;
    if (!GWP_TABLE[gas as GreenhouseGas]) {
      throw new CalculationError(`Unknown greenhouse gas in factor set: ${gas}`, { gas });
    }
    const massKg = normalizedQuantity * factorValue;
    trace.add({
      stepName: `${label}: ${gas} mass`,
      formula: `activity × EF(${gas})`,
      inputs: {
        activity: normalizedQuantity,
        activityUnit: factors.denominatorUnit,
        emissionFactor: factorValue,
        emissionFactorUnit: `kg ${gas}/${factors.denominatorUnit}`,
        factorId: factors.factorId ?? null,
      },
      output: massKg,
      unit: `kg ${gas}`,
    });

    if (gas === "CO2" && biogenicFraction > 0) {
      const biogenicPart = massKg * biogenicFraction;
      const fossilPart = massKg - biogenicPart;
      trace.add({
        stepName: `${label}: separate biogenic CO2`,
        formula: "CO2 mass × biogenicFraction (reported outside the scope totals)",
        inputs: { co2MassKg: massKg, biogenicFraction },
        output: biogenicPart,
        unit: "kg CO2 (biogenic)",
        notes:
          "Per the GHG Protocol, CO2 from biomass oxidation is reported separately and excluded from the scope total.",
      });
      biogenicCo2Kg += biogenicPart;
      perGasKg.CO2 = (perGasKg.CO2 ?? 0) + fossilPart;
      continue;
    }

    perGasKg[gas] = (perGasKg[gas] ?? 0) + massKg;
  }

  // Step 4: GWP application, one step per gas.
  for (const [gas, massKg] of Object.entries(perGasKg)) {
    const entry = GWP_TABLE[gas as GreenhouseGas];
    const gwp = entry.gwp[gwpVersion];
    trace.add({
      stepName: `${label}: ${gas} to CO2e`,
      formula: `mass(${gas}) × GWP100(${gas}, ${gwpVersion})`,
      inputs: { massKg, gwp, gwpVersion },
      output: massKg * gwp,
      unit: "kg CO2e",
    });
  }

  // Step 5: a factor the publisher already aggregated to CO2e.
  const aggregateCo2eKg =
    factors.co2eKgPerUnit === undefined
      ? undefined
      : normalizedQuantity * factors.co2eKgPerUnit;

  if (aggregateCo2eKg !== undefined) {
    trace.add({
      stepName: `${label}: aggregated CO2e`,
      formula: "activity × EF(CO2e)",
      inputs: {
        activity: normalizedQuantity,
        activityUnit: factors.denominatorUnit,
        emissionFactor: factors.co2eKgPerUnit ?? null,
        emissionFactorUnit: `kg CO2e/${factors.denominatorUnit}`,
        factorId: factors.factorId ?? null,
      },
      output: aggregateCo2eKg,
      unit: "kg CO2e",
      notes:
        "Factor is published pre-aggregated to CO2e, so the constituent gases are not attributable to individual gas columns.",
    });
  }

  const gases = buildGasBreakdown({
    perGasKg: perGasKg as GasMasses,
    aggregateCo2eKg,
    biogenicCo2Kg,
    gwpVersion,
  });

  trace.add({
    stepName: `${label}: total`,
    formula: "Σ CO2e ÷ 1000",
    inputs: {
      totalCo2eKg: gases.totalCO2e * KG_PER_TONNE,
      biogenicCo2Kg,
      gwpVersion,
    },
    output: gases.totalCO2e,
    unit: gases.unit,
  });

  return { gases, trace: trace.build(), normalizedQuantity };
}
