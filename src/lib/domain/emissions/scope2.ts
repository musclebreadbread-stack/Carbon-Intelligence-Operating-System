/**
 * Scope 2 — indirect emissions from purchased energy.
 *
 * The GHG Protocol Scope 2 Guidance requires **dual reporting**:
 *
 *  - *location-based*: grid average factor × consumption, ignoring contracts.
 *  - *market-based*: contractual instruments applied in a strict hierarchy, with
 *    the residual mix covering whatever is left uncontracted.
 *
 * Market-based hierarchy implemented here (highest quality first):
 *   1. supplier-specific rate (a utility-specific emission rate)
 *   2. energy-attribute certificates — RECs / GOs / I-RECs / PPAs
 *   3. residual mix for the remaining, uncovered consumption
 *   4. grid average as an explicit fallback when no residual mix is published
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { GwpVersion } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";

import { conversionFactor } from "../units/convert";

import { applyFactorSet } from "./apply-factor";
import {
  KG_PER_TONNE,
  buildGasBreakdown,
  createTrace,
  type ActivityFactorSet,
  type EmissionCalcTrace,
  type EmissionComputation,
} from "./types";

// ---------------------------------------------------------------------------
// Location-based
// ---------------------------------------------------------------------------

export type LocationBasedInput = {
  /** Energy purchased and consumed in the reporting period. */
  readonly quantity: number;
  readonly unit: string;
  /** Grid average factor for the market the facility operates in. */
  readonly gridFactor: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  readonly label?: string;
};

/** Location-based Scope 2: `emissions = consumption × grid average factor`. */
export function calculateLocationBased(input: LocationBasedInput): EmissionComputation {
  const label = input.label ?? "Purchased electricity (location-based)";
  const { gases, trace } = applyFactorSet({
    quantity: input.quantity,
    unit: input.unit,
    factors: input.gridFactor,
    gwpVersion: input.gwpVersion,
    label,
  });

  return {
    gases,
    trace,
    scope: "SCOPE_2_LOCATION",
    method: "location-based",
    factorId: input.gridFactor.factorId ?? null,
    factorUncertainty: input.gridFactor.uncertainty ?? null,
  };
}

// ---------------------------------------------------------------------------
// Market-based
// ---------------------------------------------------------------------------

export type ContractualInstrument = {
  readonly id: string;
  /** Instrument class, used only for the trace narrative. */
  readonly type: "REC" | "GO" | "I_REC" | "PPA" | "GREEN_TARIFF";
  /** Energy volume the instrument covers, in `unit`. */
  readonly quantity: number;
  readonly unit: string;
  /**
   * Emission rate of the contracted energy, kg CO2e per `unit`. Zero for a
   * standard renewable REC; non-zero instruments (e.g. a low-carbon tariff that
   * is not zero-emission) are supported.
   */
  readonly co2eKgPerUnit: number;
};

export type MarketBasedInput = {
  readonly quantity: number;
  readonly unit: string;
  readonly gwpVersion: GwpVersion;
  /** Highest-priority instrument: a utility-specific emission rate. */
  readonly supplierFactor?: ActivityFactorSet;
  /** Energy-attribute certificates and PPAs covering part of the consumption. */
  readonly instruments?: readonly ContractualInstrument[];
  /**
   * Residual-mix factor for the market, applied to uncovered consumption.
   * Required by the Scope 2 Guidance wherever a residual mix is published.
   */
  readonly residualMixFactor?: ActivityFactorSet;
  /**
   * Grid average factor, used only as an explicit fallback when no residual mix
   * is available. The substitution is recorded in the trace.
   */
  readonly gridFactor?: ActivityFactorSet;
  readonly label?: string;
};

export type MarketBasedResult = EmissionComputation & {
  /** Fraction of consumption covered by contractual instruments (0..1). */
  readonly instrumentCoverage: number;
  /** Consumption left for the residual mix, in the reporting unit. */
  readonly uncoveredQuantity: number;
  /** True when the grid average stood in for a missing residual mix. */
  readonly usedGridFallback: boolean;
};

/**
 * Market-based Scope 2.
 *
 * When a supplier-specific rate covers the whole load it is used alone. Otherwise
 * certificates are applied up to the consumed volume — over-procurement cannot
 * create negative emissions, so coverage is clamped at 100 % — and the remainder
 * is charged at the residual mix (or, failing that, the grid average).
 */
export function calculateMarketBased(input: MarketBasedInput): MarketBasedResult {
  const label = input.label ?? "Purchased electricity (market-based)";

  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new CalculationError("Scope 2 consumption must be a finite, non-negative number", {
      quantity: input.quantity,
    });
  }

  const trace = createTrace();

  // 1. Supplier-specific rate takes precedence over everything else.
  if (input.supplierFactor) {
    trace.add({
      stepName: `${label}: apply supplier-specific rate`,
      formula: "consumption × supplier emission rate",
      inputs: {
        hierarchyStep: 1,
        factorId: input.supplierFactor.factorId ?? null,
      },
      output: input.quantity,
      unit: input.unit,
      notes:
        "A supplier-specific rate is the highest-quality market-based instrument and supersedes certificates and the residual mix.",
    });

    const { gases, trace: fullTrace } = applyFactorSet({
      quantity: input.quantity,
      unit: input.unit,
      factors: input.supplierFactor,
      gwpVersion: input.gwpVersion,
      label,
      trace,
    });

    return {
      gases,
      trace: fullTrace,
      scope: "SCOPE_2_MARKET",
      method: "market-based-supplier-specific",
      factorId: input.supplierFactor.factorId ?? null,
      factorUncertainty: input.supplierFactor.uncertainty ?? null,
      instrumentCoverage: 0,
      uncoveredQuantity: 0,
      usedGridFallback: false,
    };
  }

  // 2. Certificates, applied up to the consumed volume.
  const instruments = input.instruments ?? [];
  let coveredQuantity = 0;
  let instrumentCo2eKg = 0;

  for (const instrument of instruments) {
    if (instrument.quantity < 0) {
      throw new CalculationError("Contractual instrument quantity cannot be negative", {
        instrumentId: instrument.id,
        quantity: instrument.quantity,
      });
    }
    const { volume: inReportingUnit, rate } = normalizeInstrument(instrument, input.unit);
    const remaining = Math.max(0, input.quantity - coveredQuantity);
    const applied = Math.min(inReportingUnit, remaining);
    const surplus = inReportingUnit - applied;

    coveredQuantity += applied;
    instrumentCo2eKg += applied * rate;

    trace.add({
      stepName: `${label}: apply ${instrument.type} ${instrument.id}`,
      formula: "min(instrument volume, remaining consumption) × instrument emission rate",
      inputs: {
        hierarchyStep: 2,
        instrumentVolume: inReportingUnit,
        remainingConsumption: remaining,
        applied,
        surplus,
        emissionRate: rate,
        emissionRateUnit: `kg CO2e/${input.unit}`,
      },
      output: applied * rate,
      unit: "kg CO2e",
      notes:
        surplus > 0
          ? `${surplus} ${input.unit} of this instrument exceeds the remaining consumption and is ignored; surplus certificates cannot create negative emissions.`
          : undefined,
    });
  }

  const uncoveredQuantity = Math.max(0, input.quantity - coveredQuantity);
  const instrumentCoverage = input.quantity === 0 ? 0 : coveredQuantity / input.quantity;

  // 3./4. Residual mix for the remainder, with the grid average as a flagged fallback.
  let residualCo2eKg = 0;
  let usedGridFallback = false;
  let residualFactorId: string | null = null;

  if (uncoveredQuantity > 0) {
    const residual = input.residualMixFactor ?? input.gridFactor;
    if (!residual) {
      throw new CalculationError(
        "Market-based Scope 2 requires a residual-mix factor (or a grid factor as fallback) for uncovered consumption",
        { uncoveredQuantity, unit: input.unit },
      );
    }
    usedGridFallback = !input.residualMixFactor;
    residualFactorId = residual.factorId ?? null;

    const residualResult = applyFactorSet({
      quantity: uncoveredQuantity,
      unit: input.unit,
      factors: residual,
      gwpVersion: input.gwpVersion,
      label: `${label}: ${usedGridFallback ? "grid average (residual-mix fallback)" : "residual mix"}`,
      trace,
    });
    residualCo2eKg = residualResult.gases.totalCO2e * KG_PER_TONNE;

    if (usedGridFallback) {
      trace.add({
        stepName: `${label}: residual-mix fallback`,
        formula: "uncovered consumption × grid average factor",
        inputs: { hierarchyStep: 4, uncoveredQuantity, gridFactorId: residualFactorId },
        output: residualCo2eKg,
        unit: "kg CO2e",
        notes:
          "No residual-mix factor was available for this market, so the grid average was substituted. This overstates the quality of the market-based figure and must be disclosed.",
      });
    }
  }

  const totalCo2eKg = Math.max(0, instrumentCo2eKg + residualCo2eKg);
  const gases = buildGasBreakdown({
    aggregateCo2eKg: totalCo2eKg,
    gwpVersion: input.gwpVersion,
  });

  trace.add({
    stepName: `${label}: total`,
    formula: "(Σ instrument CO2e + residual CO2e) ÷ 1000, floored at 0",
    inputs: {
      instrumentCo2eKg,
      residualCo2eKg,
      instrumentCoverage,
      uncoveredQuantity,
    },
    output: gases.totalCO2e,
    unit: gases.unit,
  });

  return {
    gases,
    trace: trace.build(),
    scope: "SCOPE_2_MARKET",
    method: instruments.length > 0 ? "market-based-instruments" : "market-based-residual-mix",
    factorId: residualFactorId,
    factorUncertainty: (input.residualMixFactor ?? input.gridFactor)?.uncertainty ?? null,
    instrumentCoverage,
    uncoveredQuantity,
    usedGridFallback,
  };
}

/**
 * Restates an instrument in the consumption record's unit: both the volume and
 * the emission rate must be rebased, or a MWh-denominated rate applied to a
 * kWh volume would be out by three orders of magnitude.
 */
function normalizeInstrument(
  instrument: ContractualInstrument,
  reportingUnit: string,
): { readonly volume: number; readonly rate: number } {
  if (instrument.unit === reportingUnit) {
    return { volume: instrument.quantity, rate: instrument.co2eKgPerUnit };
  }
  const factor = conversionFactor(instrument.unit, reportingUnit);
  return {
    volume: instrument.quantity * factor,
    rate: instrument.co2eKgPerUnit / factor,
  };
}

// ---------------------------------------------------------------------------
// Dual reporting
// ---------------------------------------------------------------------------

export type DualReportingInput = LocationBasedInput & Omit<MarketBasedInput, "label"> & {
  readonly marketLabel?: string;
};

export type DualReportingResult = {
  readonly locationBased: EmissionComputation;
  readonly marketBased: MarketBasedResult;
  /** Market-based minus location-based, in tCO2e (negative = contracts help). */
  readonly marketVsLocationDelta: number;
  readonly trace: EmissionCalcTrace;
};

/**
 * Produces both required Scope 2 figures from a single consumption record.
 * Both must be disclosed; neither replaces the other.
 */
export function calculateScope2DualReporting(
  input: DualReportingInput,
): DualReportingResult {
  const locationBased = calculateLocationBased({
    quantity: input.quantity,
    unit: input.unit,
    gridFactor: input.gridFactor,
    gwpVersion: input.gwpVersion,
    label: input.label,
  });

  const marketBased = calculateMarketBased({
    quantity: input.quantity,
    unit: input.unit,
    gwpVersion: input.gwpVersion,
    supplierFactor: input.supplierFactor,
    instruments: input.instruments,
    residualMixFactor: input.residualMixFactor,
    gridFactor: input.gridFactor,
    label: input.marketLabel,
  });

  const trace = createTrace()
    .merge(locationBased.trace, "Location-based")
    .merge(marketBased.trace, "Market-based")
    .add({
      stepName: "Scope 2 dual reporting",
      formula: "marketBased − locationBased",
      inputs: {
        locationBased: locationBased.gases.totalCO2e,
        marketBased: marketBased.gases.totalCO2e,
      },
      output: marketBased.gases.totalCO2e - locationBased.gases.totalCO2e,
      unit: locationBased.gases.unit,
      notes:
        "The GHG Protocol Scope 2 Guidance requires both figures to be disclosed; the market-based figure reflects contractual instruments.",
    })
    .build();

  return {
    locationBased,
    marketBased,
    marketVsLocationDelta: marketBased.gases.totalCO2e - locationBased.gases.totalCO2e,
    trace,
  };
}

/** Convenience accessor for the pair of totals a disclosure needs. */
export function scope2Totals(result: DualReportingResult): {
  readonly locationBased: number;
  readonly marketBased: number;
  readonly unit: string;
} {
  return {
    locationBased: result.locationBased.gases.totalCO2e,
    marketBased: result.marketBased.gases.totalCO2e,
    unit: result.locationBased.gases.unit,
  };
}
