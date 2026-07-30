/**
 * Scope 1 — direct emissions from sources owned or controlled by the organisation.
 *
 * Four source types, per the GHG Protocol Corporate Standard:
 *  - stationary combustion (boilers, furnaces, generators)
 *  - mobile combustion (owned fleet, either fuel-based or distance-based)
 *  - process emissions (chemical/physical transformation, e.g. calcination)
 *  - fugitive emissions (refrigerant leakage, SF6 from switchgear)
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { GwpVersion } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { blendGwp, type GreenhouseGas } from "@/lib/reference/gwp";

import { applyFactorSet } from "./apply-factor";
import {
  buildGasBreakdown,
  createTrace,
  type ActivityFactorSet,
  type EmissionComputation,
} from "./types";

// ---------------------------------------------------------------------------
// Stationary combustion
// ---------------------------------------------------------------------------

export type StationaryCombustionInput = {
  /** Fuel consumed in the reporting period. */
  readonly quantity: number;
  readonly unit: string;
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  /** Fuel name used in the trace, e.g. `"Natural gas"`. */
  readonly fuelName?: string;
};

/**
 * Stationary combustion: `emissions = fuel consumption × emission factor`.
 *
 * Biogenic CO2 (from the biomass share of a blended fuel) is separated out via
 * `factors.biogenicFraction` and excluded from the scope total.
 */
export function calculateStationaryCombustion(
  input: StationaryCombustionInput,
): EmissionComputation {
  const label = input.fuelName ?? "Stationary combustion";
  const { gases, trace } = applyFactorSet({
    quantity: input.quantity,
    unit: input.unit,
    factors: input.factors,
    gwpVersion: input.gwpVersion,
    label,
  });

  return {
    gases,
    trace,
    scope: "SCOPE_1",
    method: "stationary-combustion",
    factorId: input.factors.factorId ?? null,
    factorUncertainty: input.factors.uncertainty ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mobile combustion
// ---------------------------------------------------------------------------

export type MobileCombustionInput = {
  /**
   * `FUEL` multiplies fuel consumed by a fuel-based factor (preferred, most
   * accurate). `DISTANCE` multiplies distance travelled by a vehicle-and-fuel
   * specific factor, used when only mileage is available.
   */
  readonly method: "FUEL" | "DISTANCE";
  readonly quantity: number;
  readonly unit: string;
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  readonly vehicleName?: string;
};

/** Mobile combustion from an owned or controlled fleet. */
export function calculateMobileCombustion(
  input: MobileCombustionInput,
): EmissionComputation {
  const label =
    input.vehicleName ??
    (input.method === "FUEL" ? "Mobile combustion (fuel)" : "Mobile combustion (distance)");

  const trace = createTrace();
  trace.add({
    stepName: `${label}: select method`,
    formula:
      input.method === "FUEL"
        ? "emissions = fuel consumed × fuel-based EF"
        : "emissions = distance travelled × distance-based EF",
    inputs: { method: input.method, quantity: input.quantity, unit: input.unit },
    output: input.quantity,
    unit: input.unit,
    notes:
      input.method === "DISTANCE"
        ? "Distance-based factors carry higher uncertainty than fuel-based factors; use fuel data when available."
        : undefined,
  });

  const { gases, trace: fullTrace } = applyFactorSet({
    quantity: input.quantity,
    unit: input.unit,
    factors: input.factors,
    gwpVersion: input.gwpVersion,
    label,
    trace,
  });

  return {
    gases,
    trace: fullTrace,
    scope: "SCOPE_1",
    method: input.method === "FUEL" ? "mobile-combustion-fuel" : "mobile-combustion-distance",
    factorId: input.factors.factorId ?? null,
    factorUncertainty: input.factors.uncertainty ?? null,
  };
}

// ---------------------------------------------------------------------------
// Process emissions
// ---------------------------------------------------------------------------

export type ProcessEmissionsInput = {
  /** Mass of process input or output, e.g. tonnes of clinker produced. */
  readonly quantity: number;
  readonly unit: string;
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  /**
   * Purity / carbonate content of the raw material (0..1). Applied before the
   * emission factor when the factor is expressed per unit of pure carbonate.
   */
  readonly purity?: number;
  /** Fraction of the carbonate actually calcined (0..1); defaults to 1. */
  readonly calcinationFraction?: number;
  readonly processName?: string;
};

/**
 * Process emissions: `emissions = process activity × purity × calcination
 * fraction × emission factor`.
 *
 * `purity` and `calcinationFraction` implement the IPCC carbonate-input
 * (Tier 2) refinement; leave them unset for the simpler output-based Tier 1
 * approach.
 */
export function calculateProcessEmissions(
  input: ProcessEmissionsInput,
): EmissionComputation {
  const label = input.processName ?? "Process emissions";
  const purity = input.purity ?? 1;
  const calcination = input.calcinationFraction ?? 1;

  for (const [name, value] of [
    ["purity", purity],
    ["calcinationFraction", calcination],
  ] as const) {
    if (value < 0 || value > 1) {
      throw new CalculationError(`${name} must be between 0 and 1`, { [name]: value });
    }
  }

  const trace = createTrace();
  const effectiveQuantity = input.quantity * purity * calcination;

  if (purity !== 1 || calcination !== 1) {
    trace.add({
      stepName: `${label}: adjust process input`,
      formula: "quantity × purity × calcinationFraction",
      inputs: { quantity: input.quantity, purity, calcinationFraction: calcination },
      output: effectiveQuantity,
      unit: input.unit,
      notes: "IPCC carbonate-input (Tier 2) refinement.",
    });
  }

  const { gases, trace: fullTrace } = applyFactorSet({
    quantity: effectiveQuantity,
    unit: input.unit,
    factors: input.factors,
    gwpVersion: input.gwpVersion,
    label,
    trace,
  });

  return {
    gases,
    trace: fullTrace,
    scope: "SCOPE_1",
    method: "process-emissions",
    factorId: input.factors.factorId ?? null,
    factorUncertainty: input.factors.uncertainty ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fugitive emissions
// ---------------------------------------------------------------------------

export type FugitiveEmissionsInput = {
  /**
   * `SCREENING` uses the simplified sales/inventory balance.
   * `MATERIAL_BALANCE` additionally accounts for the change in installed
   * equipment charge, which is required when the fleet of equipment changes.
   */
  readonly method: "SCREENING" | "MATERIAL_BALANCE";
  readonly gwpVersion: GwpVersion;
  /**
   * Either a single gas (`"SF6"`, `"HFC_134A"`) or a refrigerant blend name from
   * `REFRIGERANT_BLENDS` (`"R-410A"`). A blend is charged at its mass-weighted GWP.
   */
  readonly gas?: GreenhouseGas;
  readonly blend?: string;
  /** Beginning inventory minus ending inventory, in kg (positive = drawn down). */
  readonly inventoryChange: number;
  /** Refrigerant purchased or acquired during the period, in kg. */
  readonly purchases: number;
  /** Refrigerant sold, returned or sent for destruction during the period, in kg. */
  readonly disposals: number;
  /**
   * Total nameplate charge of installed equipment at period end minus at period
   * start, in kg. Required for `MATERIAL_BALANCE`: refrigerant that went into
   * new equipment was not emitted.
   */
  readonly capacityChange?: number;
  readonly sourceName?: string;
};

/**
 * Fugitive emissions from refrigerants and insulating gases.
 *
 * SCREENING:        `E = inventoryChange + purchases − disposals`
 * MATERIAL_BALANCE: `E = inventoryChange + purchases − disposals − capacityChange`
 *
 * A negative result is physically impossible, so it is clamped to zero and the
 * inconsistency is recorded in the trace for the data-quality rules to pick up.
 */
export function calculateFugitiveEmissions(
  input: FugitiveEmissionsInput,
): EmissionComputation {
  const label = input.sourceName ?? input.blend ?? input.gas ?? "Fugitive emissions";

  if (!input.gas && !input.blend) {
    throw new CalculationError("Fugitive emissions require either a gas or a blend", {
      label,
    });
  }
  if (input.gas && input.blend) {
    throw new CalculationError("Specify either a gas or a blend, not both", {
      gas: input.gas,
      blend: input.blend,
    });
  }
  if (input.method === "MATERIAL_BALANCE" && input.capacityChange === undefined) {
    throw new CalculationError(
      "The material-balance method requires capacityChange (installed charge at end − at start)",
      { label },
    );
  }

  const capacityChange = input.capacityChange ?? 0;
  const rawLeakKg =
    input.inventoryChange +
    input.purchases -
    input.disposals -
    (input.method === "MATERIAL_BALANCE" ? capacityChange : 0);
  const leakKg = Math.max(0, rawLeakKg);

  const trace = createTrace();
  trace.add({
    stepName: `${label}: refrigerant balance`,
    formula:
      input.method === "MATERIAL_BALANCE"
        ? "inventoryChange + purchases − disposals − capacityChange"
        : "inventoryChange + purchases − disposals",
    inputs: {
      method: input.method,
      inventoryChange: input.inventoryChange,
      purchases: input.purchases,
      disposals: input.disposals,
      capacityChange: input.method === "MATERIAL_BALANCE" ? capacityChange : null,
    },
    output: leakKg,
    unit: "kg refrigerant",
    notes:
      rawLeakKg < 0
        ? `Balance produced ${rawLeakKg} kg, which is physically impossible; clamped to 0. Review the inventory and purchase records.`
        : undefined,
  });

  if (input.blend) {
    // A blend has no single GWP table entry, so the CO2e is computed from the
    // mass-weighted GWP of its constituents.
    const gwp = blendGwp(input.blend, input.gwpVersion);
    const co2eKg = leakKg * gwp;
    trace.add({
      stepName: `${label}: blend to CO2e`,
      formula: `leak × blendedGWP100(${input.blend}, ${input.gwpVersion})`,
      inputs: { leakKg, blend: input.blend, blendedGwp: gwp, gwpVersion: input.gwpVersion },
      output: co2eKg,
      unit: "kg CO2e",
    });

    const gases = buildGasBreakdown({
      aggregateCo2eKg: co2eKg,
      gwpVersion: input.gwpVersion,
    });

    trace.add({
      stepName: `${label}: total`,
      formula: "CO2e ÷ 1000",
      inputs: { totalCo2eKg: co2eKg },
      output: gases.totalCO2e,
      unit: gases.unit,
    });

    return {
      gases,
      trace: trace.build(),
      scope: "SCOPE_1",
      method:
        input.method === "MATERIAL_BALANCE"
          ? "fugitive-material-balance"
          : "fugitive-screening",
    };
  }

  const gas = input.gas as GreenhouseGas;
  const { gases, trace: fullTrace } = applyFactorSet({
    quantity: leakKg,
    unit: "kg",
    factors: { denominatorUnit: "kg", perGasKg: { [gas]: 1 } },
    gwpVersion: input.gwpVersion,
    label,
    trace,
  });

  return {
    gases,
    trace: fullTrace,
    scope: "SCOPE_1",
    method:
      input.method === "MATERIAL_BALANCE"
        ? "fugitive-material-balance"
        : "fugitive-screening",
  };
}

