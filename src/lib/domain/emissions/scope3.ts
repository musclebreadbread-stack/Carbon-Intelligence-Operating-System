/**
 * Scope 3 — value-chain emissions, all 15 GHG Protocol categories.
 *
 * Every category exposes a dedicated function plus a shared dispatcher
 * (`calculateScope3Category`). The four `CalculationApproach` families are
 * handled uniformly:
 *
 *  - `SPEND_BASED`      quantity is spend, the factor is kg CO2e per currency unit
 *  - `ACTIVITY_BASED`   quantity is physical activity (kWh, t, tkm, pkm, …)
 *  - `AVERAGE_DATA`     as activity-based, but with an industry-average factor
 *  - `SUPPLIER_SPECIFIC` the supplier's own reported figure is used directly
 *  - `HYBRID`           supplier-reported data for part of the activity, a factor
 *                       for the residual `quantity`
 *
 * Because spend is modelled as a `CURRENCY`-dimension unit in the unit registry,
 * spend-based and activity-based calculations share one code path — only the
 * validation and the trace narrative differ.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { CalculationApproach, GwpVersion, Scope3Category } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { scope3Definition } from "@/lib/reference/scope3-categories";

import { convert } from "../units/convert";

import { applyFactorSet } from "./apply-factor";
import {
  KG_PER_TONNE,
  TraceBuilder,
  addGasBreakdowns,
  buildGasBreakdown,
  createTrace,
  type ActivityFactorSet,
  type EmissionComputation,
} from "./types";

export type Scope3Computation = EmissionComputation & {
  readonly scope3Category: Scope3Category;
};

// ---------------------------------------------------------------------------
// Shared input shapes
// ---------------------------------------------------------------------------

/** The generic activity/spend input used by most categories. */
export type Scope3ActivityInput = {
  /** Physical activity or spend, depending on `approach`. */
  readonly quantity: number;
  readonly unit: string;
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly label?: string;
  /**
   * Emissions the supplier reported directly, in tCO2e. Used alone under
   * `SUPPLIER_SPECIFIC`; added to the factor-based result under `HYBRID`, where
   * `quantity` must be the residual activity the supplier data does not cover.
   */
  readonly supplierReportedTCO2e?: number;
};

function assertApproachSupported(
  category: Scope3Category,
  approach: CalculationApproach,
): void {
  const definition = scope3Definition(category);
  if (!definition.supportedApproaches.includes(approach)) {
    throw new CalculationError(
      `${approach} is not a supported approach for ${category} (supported: ${definition.supportedApproaches.join(", ")})`,
      { category, approach, supported: definition.supportedApproaches },
    );
  }
}

/**
 * The shared engine behind categories 1, 2, 8, 10 and 13, and the building block
 * the more structured categories reduce to.
 */
function calculateFromActivity(
  category: Scope3Category,
  input: Scope3ActivityInput,
  options?: { readonly trace?: TraceBuilder; readonly methodSuffix?: string },
): Scope3Computation {
  const definition = scope3Definition(category);
  const approach = input.approach ?? definition.defaultApproach;
  assertApproachSupported(category, approach);

  const label = input.label ?? `Cat ${definition.number} ${definition.nameEn}`;
  const trace = options?.trace ?? createTrace();

  trace.add({
    stepName: `${label}: approach`,
    formula:
      approach === "SPEND_BASED"
        ? "emissions = spend × EEIO factor"
        : approach === "SUPPLIER_SPECIFIC"
          ? "emissions = supplier-reported emissions"
          : "emissions = activity × emission factor",
    inputs: {
      category,
      categoryNumber: definition.number,
      approach,
      quantity: input.quantity,
      unit: input.unit,
    },
    output: input.quantity,
    unit: input.unit,
    notes:
      approach === "SPEND_BASED"
        ? "Spend-based factors carry the highest uncertainty of the Scope 3 methods; replace with supplier data where available."
        : undefined,
  });

  if (approach === "SUPPLIER_SPECIFIC") {
    if (input.supplierReportedTCO2e === undefined) {
      throw new CalculationError(
        "SUPPLIER_SPECIFIC requires supplierReportedTCO2e",
        { category },
      );
    }
    const gases = buildGasBreakdown({
      aggregateCo2eKg: input.supplierReportedTCO2e * KG_PER_TONNE,
      gwpVersion: input.gwpVersion,
    });
    trace.add({
      stepName: `${label}: total`,
      formula: "supplier-reported tCO2e",
      inputs: { supplierReportedTCO2e: input.supplierReportedTCO2e },
      output: gases.totalCO2e,
      unit: gases.unit,
    });
    return {
      gases,
      trace: trace.build(),
      scope: "SCOPE_3",
      scope3Category: category,
      method: `scope3-cat${definition.number}-supplier-specific`,
      factorId: null,
      factorUncertainty: null,
    };
  }

  const { gases: factorGases, trace: builtTrace } = applyFactorSet({
    quantity: input.quantity,
    unit: input.unit,
    factors: input.factors,
    gwpVersion: input.gwpVersion,
    label,
    trace,
  });

  if (approach !== "HYBRID") {
    return {
      gases: factorGases,
      trace: builtTrace,
      scope: "SCOPE_3",
      scope3Category: category,
      method: `scope3-cat${definition.number}-${(options?.methodSuffix ?? approach.toLowerCase()).replace(/_/g, "-")}`,
      factorId: input.factors.factorId ?? null,
      factorUncertainty: input.factors.uncertainty ?? null,
    };
  }

  // HYBRID: supplier-reported emissions for the covered share, factor-based for
  // the residual quantity supplied above.
  const supplierTonnes = input.supplierReportedTCO2e ?? 0;
  const supplierGases = buildGasBreakdown({
    aggregateCo2eKg: supplierTonnes * KG_PER_TONNE,
    gwpVersion: input.gwpVersion,
  });
  const gases = addGasBreakdowns(factorGases, supplierGases);

  const hybridTrace = createTrace()
    .merge(builtTrace)
    .add({
      stepName: `${label}: add supplier-reported share`,
      formula: "factor-based residual + supplier-reported emissions",
      inputs: {
        factorBasedTCO2e: factorGases.totalCO2e,
        supplierReportedTCO2e: supplierTonnes,
      },
      output: gases.totalCO2e,
      unit: gases.unit,
      notes:
        "Hybrid method: supplier primary data where available, secondary factors for the residual.",
    })
    .build();

  return {
    gases,
    trace: hybridTrace,
    scope: "SCOPE_3",
    scope3Category: category,
    method: `scope3-cat${definition.number}-hybrid`,
    factorId: input.factors.factorId ?? null,
    factorUncertainty: input.factors.uncertainty ?? null,
  };
}

/**
 * Generic Scope 3 calculation for any category, from a single quantity + unit.
 *
 * This is the path the orchestrator takes: a persisted `ActivityDataEntry` has
 * already been reduced to one quantity in one unit (tkm, pkm, kWh, USD, …), so
 * the structured category helpers above are only needed by the data-capture
 * flows that perform that reduction.
 */
export function calculateScope3Generic(
  category: Scope3Category,
  input: Scope3ActivityInput,
): Scope3Computation {
  return calculateFromActivity(category, input);
}

// ---------------------------------------------------------------------------
// Category 1 — Purchased goods and services
// ---------------------------------------------------------------------------

export function calculateCat1PurchasedGoods(
  input: Scope3ActivityInput,
): Scope3Computation {
  return calculateFromActivity("CAT_1_PURCHASED_GOODS", input);
}

// ---------------------------------------------------------------------------
// Category 2 — Capital goods
// ---------------------------------------------------------------------------

export function calculateCat2CapitalGoods(
  input: Scope3ActivityInput,
): Scope3Computation {
  return calculateFromActivity("CAT_2_CAPITAL_GOODS", input);
}

// ---------------------------------------------------------------------------
// Category 3 — Fuel- and energy-related activities
// ---------------------------------------------------------------------------

export type Cat3FuelComponent = {
  readonly name?: string;
  /** Fuel consumed in Scope 1 during the period. */
  readonly quantity: number;
  readonly unit: string;
  /** Well-to-tank (upstream) factor for that fuel. */
  readonly factors: ActivityFactorSet;
};

export type Cat3ElectricityComponent = {
  readonly name?: string;
  /** Electricity delivered and consumed in Scope 2. */
  readonly quantity: number;
  readonly unit: string;
  /**
   * Transmission-and-distribution losses as a fraction of *gross generation*.
   * When given, the electricity that had to be generated to cover the losses is
   * `delivered × lossRate / (1 − lossRate)` and `factors` is the generation
   * factor. Omit it when `factors` is already a per-kWh-delivered T&D factor.
   */
  readonly lossRate?: number;
  readonly factors: ActivityFactorSet;
};

export type Cat3Input = {
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly label?: string;
  /** Upstream (WTT) emissions of fuels combusted in Scope 1. */
  readonly fuels?: readonly Cat3FuelComponent[];
  /** Upstream and T&D-loss emissions of purchased electricity. */
  readonly electricity?: readonly Cat3ElectricityComponent[];
};

/**
 * Category 3 is derived from the Scope 1 and Scope 2 activity data rather than
 * from new activity data: upstream (well-to-tank) emissions of the fuels burned
 * in Scope 1, plus the generation emissions of grid losses on Scope 2 purchases.
 */
export function calculateCat3FuelEnergy(input: Cat3Input): Scope3Computation {
  const definition = scope3Definition("CAT_3_FUEL_ENERGY");
  const approach = input.approach ?? definition.defaultApproach;
  assertApproachSupported("CAT_3_FUEL_ENERGY", approach);

  const label = input.label ?? "Cat 3 Fuel- and energy-related activities";
  const fuels = input.fuels ?? [];
  const electricity = input.electricity ?? [];

  if (fuels.length === 0 && electricity.length === 0) {
    throw new CalculationError(
      "Category 3 requires at least one fuel or electricity component",
      {},
    );
  }

  const trace = createTrace();
  let gases = buildGasBreakdown({ gwpVersion: input.gwpVersion });

  for (const fuel of fuels) {
    const componentLabel = `${label}: WTT ${fuel.name ?? "fuel"}`;
    const result = applyFactorSet({
      quantity: fuel.quantity,
      unit: fuel.unit,
      factors: fuel.factors,
      gwpVersion: input.gwpVersion,
      label: componentLabel,
      trace,
    });
    gases = addGasBreakdowns(gases, result.gases);
  }

  for (const grid of electricity) {
    const componentLabel = `${label}: T&D ${grid.name ?? "electricity"}`;
    let quantity = grid.quantity;

    if (grid.lossRate !== undefined) {
      if (grid.lossRate < 0 || grid.lossRate >= 1) {
        throw new CalculationError("lossRate must be in [0, 1)", {
          lossRate: grid.lossRate,
        });
      }
      quantity = (grid.quantity * grid.lossRate) / (1 - grid.lossRate);
      trace.add({
        stepName: `${componentLabel}: gross up for grid losses`,
        formula: "delivered × lossRate ÷ (1 − lossRate)",
        inputs: { delivered: grid.quantity, lossRate: grid.lossRate },
        output: quantity,
        unit: grid.unit,
        notes:
          "Electricity that had to be generated to cover transmission and distribution losses.",
      });
    }

    const result = applyFactorSet({
      quantity,
      unit: grid.unit,
      factors: grid.factors,
      gwpVersion: input.gwpVersion,
      label: componentLabel,
      trace,
    });
    gases = addGasBreakdowns(gases, result.gases);
  }

  trace.add({
    stepName: `${label}: total`,
    formula: "Σ (WTT of Scope 1 fuels) + Σ (grid loss generation)",
    inputs: { fuelComponents: fuels.length, electricityComponents: electricity.length },
    output: gases.totalCO2e,
    unit: gases.unit,
  });

  return {
    gases,
    trace: trace.build(),
    scope: "SCOPE_3",
    scope3Category: "CAT_3_FUEL_ENERGY",
    method: "scope3-cat3-derived-from-scope12",
  };
}

// ---------------------------------------------------------------------------
// Categories 4 & 9 — Transportation and distribution
// ---------------------------------------------------------------------------

export type FreightInput = {
  /** Shipment mass. */
  readonly mass: number;
  readonly massUnit: string;
  readonly distance: number;
  readonly distanceUnit: string;
  /** Factor per tonne-kilometre, or per currency unit when spend-based. */
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly mode?: string;
  readonly label?: string;
  readonly supplierReportedTCO2e?: number;
};

function calculateFreight(
  category: "CAT_4_UPSTREAM_TRANSPORT" | "CAT_9_DOWNSTREAM_TRANSPORT",
  input: FreightInput,
): Scope3Computation {
  const definition = scope3Definition(category);
  const label =
    input.label ?? `Cat ${definition.number} ${input.mode ?? "freight"} transport`;

  const massTonnes = convert(input.mass, input.massUnit, "t");
  const distanceKm = convert(input.distance, input.distanceUnit, "km");
  const tonneKm = massTonnes * distanceKm;

  const trace = createTrace();
  trace.add({
    stepName: `${label}: tonne-kilometres`,
    formula: "mass(t) × distance(km)",
    inputs: {
      mass: input.mass,
      massUnit: input.massUnit,
      massTonnes,
      distance: input.distance,
      distanceUnit: input.distanceUnit,
      distanceKm,
      mode: input.mode ?? null,
    },
    output: tonneKm,
    unit: "tkm",
  });

  return calculateFromActivity(
    category,
    {
      quantity: tonneKm,
      unit: "tkm",
      factors: input.factors,
      gwpVersion: input.gwpVersion,
      approach: input.approach,
      label,
      supplierReportedTCO2e: input.supplierReportedTCO2e,
    },
    { trace },
  );
}

export function calculateCat4UpstreamTransport(input: FreightInput): Scope3Computation {
  return calculateFreight("CAT_4_UPSTREAM_TRANSPORT", input);
}

export function calculateCat9DownstreamTransport(input: FreightInput): Scope3Computation {
  return calculateFreight("CAT_9_DOWNSTREAM_TRANSPORT", input);
}

// ---------------------------------------------------------------------------
// Categories 5 & 12 — Waste and end-of-life
// ---------------------------------------------------------------------------

export type WasteInput = {
  readonly mass: number;
  readonly massUnit: string;
  /** e.g. `"landfill"`, `"recycling"`, `"incineration"`, `"composting"`. */
  readonly treatmentMethod: string;
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly label?: string;
  readonly supplierReportedTCO2e?: number;
};

function calculateWaste(
  category: "CAT_5_WASTE" | "CAT_12_END_OF_LIFE",
  input: WasteInput,
): Scope3Computation {
  const definition = scope3Definition(category);
  const label =
    input.label ?? `Cat ${definition.number} ${input.treatmentMethod} treatment`;

  const trace = createTrace();
  trace.add({
    stepName: `${label}: treatment route`,
    formula: "mass × treatment-specific emission factor",
    inputs: {
      treatmentMethod: input.treatmentMethod,
      mass: input.mass,
      massUnit: input.massUnit,
    },
    output: input.mass,
    unit: input.massUnit,
  });

  return calculateFromActivity(
    category,
    {
      quantity: input.mass,
      unit: input.massUnit,
      factors: input.factors,
      gwpVersion: input.gwpVersion,
      approach: input.approach,
      label,
      supplierReportedTCO2e: input.supplierReportedTCO2e,
    },
    { trace },
  );
}

export function calculateCat5Waste(input: WasteInput): Scope3Computation {
  return calculateWaste("CAT_5_WASTE", input);
}

export function calculateCat12EndOfLife(input: WasteInput): Scope3Computation {
  return calculateWaste("CAT_12_END_OF_LIFE", input);
}

// ---------------------------------------------------------------------------
// Category 6 — Business travel
// ---------------------------------------------------------------------------

export type Cat6Input = {
  readonly distance: number;
  readonly distanceUnit: string;
  /** Number of travellers on the journey; passenger-km = distance × travellers. */
  readonly travellers?: number;
  readonly mode?: string;
  /** Factor per passenger-kilometre (or per currency unit when spend-based). */
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly label?: string;
  /** Hotel nights, charged at `hotelFactorKgPerNight`. */
  readonly hotelNights?: number;
  readonly hotelFactorKgPerNight?: number;
};

/** Business travel, including an optional hotel-stay component. */
export function calculateCat6BusinessTravel(input: Cat6Input): Scope3Computation {
  const label = input.label ?? `Cat 6 business travel (${input.mode ?? "mixed"})`;
  const travellers = input.travellers ?? 1;
  const distanceKm = convert(input.distance, input.distanceUnit, "km");
  const passengerKm = distanceKm * travellers;

  const trace = createTrace();
  trace.add({
    stepName: `${label}: passenger-kilometres`,
    formula: "distance(km) × travellers",
    inputs: {
      distance: input.distance,
      distanceUnit: input.distanceUnit,
      distanceKm,
      travellers,
      mode: input.mode ?? null,
    },
    output: passengerKm,
    unit: "pkm",
  });

  const travel = calculateFromActivity(
    "CAT_6_BUSINESS_TRAVEL",
    {
      quantity: passengerKm,
      unit: "pkm",
      factors: input.factors,
      gwpVersion: input.gwpVersion,
      approach: input.approach,
      label,
    },
    { trace },
  );

  if (!input.hotelNights || !input.hotelFactorKgPerNight) return travel;

  const hotelKg = input.hotelNights * input.hotelFactorKgPerNight;
  const hotelGases = buildGasBreakdown({
    aggregateCo2eKg: hotelKg,
    gwpVersion: input.gwpVersion,
  });
  const gases = addGasBreakdowns(travel.gases, hotelGases);

  const fullTrace = createTrace()
    .merge(travel.trace)
    .add({
      stepName: `${label}: hotel stays`,
      formula: "nights × EF(kg CO2e/night)",
      inputs: {
        hotelNights: input.hotelNights,
        hotelFactorKgPerNight: input.hotelFactorKgPerNight,
      },
      output: hotelKg,
      unit: "kg CO2e",
    })
    .add({
      stepName: `${label}: total including accommodation`,
      formula: "travel CO2e + accommodation CO2e",
      inputs: { travelTCO2e: travel.gases.totalCO2e, hotelTCO2e: hotelGases.totalCO2e },
      output: gases.totalCO2e,
      unit: gases.unit,
    })
    .build();

  return { ...travel, gases, trace: fullTrace };
}

// ---------------------------------------------------------------------------
// Category 7 — Employee commuting
// ---------------------------------------------------------------------------

export type Cat7Input = {
  readonly employeeCount: number;
  /** Working days in the reporting period. */
  readonly workingDays: number;
  /** Round-trip commute distance per employee per working day. */
  readonly dailyDistance: number;
  readonly distanceUnit: string;
  readonly mode?: string;
  /** Factor per passenger-kilometre. */
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly label?: string;
  /** Share of working days spent working from home (0..1). */
  readonly remoteWorkShare?: number;
  /** Emissions per home-working day, in kg CO2e. */
  readonly homeOfficeFactorKgPerDay?: number;
};

/** Employee commuting, including optional teleworking emissions. */
export function calculateCat7EmployeeCommuting(input: Cat7Input): Scope3Computation {
  const label = input.label ?? `Cat 7 employee commuting (${input.mode ?? "mixed"})`;
  const remoteShare = input.remoteWorkShare ?? 0;
  if (remoteShare < 0 || remoteShare > 1) {
    throw new CalculationError("remoteWorkShare must be between 0 and 1", {
      remoteWorkShare: remoteShare,
    });
  }

  const commutingDays = input.workingDays * (1 - remoteShare);
  const dailyKm = convert(input.dailyDistance, input.distanceUnit, "km");
  const passengerKm = input.employeeCount * commutingDays * dailyKm;

  const trace = createTrace();
  trace.add({
    stepName: `${label}: passenger-kilometres`,
    formula: "employees × workingDays × (1 − remoteWorkShare) × dailyDistance(km)",
    inputs: {
      employeeCount: input.employeeCount,
      workingDays: input.workingDays,
      remoteWorkShare: remoteShare,
      commutingDays,
      dailyKm,
      mode: input.mode ?? null,
    },
    output: passengerKm,
    unit: "pkm",
  });

  const commuting = calculateFromActivity(
    "CAT_7_EMPLOYEE_COMMUTING",
    {
      quantity: passengerKm,
      unit: "pkm",
      factors: input.factors,
      gwpVersion: input.gwpVersion,
      approach: input.approach,
      label,
    },
    { trace },
  );

  if (!input.homeOfficeFactorKgPerDay || remoteShare === 0) return commuting;

  const homeDays = input.employeeCount * input.workingDays * remoteShare;
  const homeKg = homeDays * input.homeOfficeFactorKgPerDay;
  const homeGases = buildGasBreakdown({
    aggregateCo2eKg: homeKg,
    gwpVersion: input.gwpVersion,
  });
  const gases = addGasBreakdowns(commuting.gases, homeGases);

  const fullTrace = createTrace()
    .merge(commuting.trace)
    .add({
      stepName: `${label}: teleworking`,
      formula: "employees × workingDays × remoteWorkShare × EF(kg CO2e/day)",
      inputs: {
        homeWorkingDays: homeDays,
        homeOfficeFactorKgPerDay: input.homeOfficeFactorKgPerDay,
      },
      output: homeKg,
      unit: "kg CO2e",
    })
    .add({
      stepName: `${label}: total including teleworking`,
      formula: "commuting CO2e + teleworking CO2e",
      inputs: {
        commutingTCO2e: commuting.gases.totalCO2e,
        teleworkingTCO2e: homeGases.totalCO2e,
      },
      output: gases.totalCO2e,
      unit: gases.unit,
    })
    .build();

  return { ...commuting, gases, trace: fullTrace };
}

// ---------------------------------------------------------------------------
// Category 8 — Upstream leased assets
// ---------------------------------------------------------------------------

export function calculateCat8UpstreamLeased(
  input: Scope3ActivityInput,
): Scope3Computation {
  return calculateFromActivity("CAT_8_UPSTREAM_LEASED", input);
}

// ---------------------------------------------------------------------------
// Category 10 — Processing of sold products
// ---------------------------------------------------------------------------

export type Cat10Input = {
  /** Mass of intermediate product sold. */
  readonly mass: number;
  readonly massUnit: string;
  /** Downstream processing factor, per mass unit. */
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly label?: string;
  readonly supplierReportedTCO2e?: number;
};

export function calculateCat10Processing(input: Cat10Input): Scope3Computation {
  return calculateFromActivity("CAT_10_PROCESSING", {
    quantity: input.mass,
    unit: input.massUnit,
    factors: input.factors,
    gwpVersion: input.gwpVersion,
    approach: input.approach,
    label: input.label ?? "Cat 10 processing of sold products",
    supplierReportedTCO2e: input.supplierReportedTCO2e,
  });
}

// ---------------------------------------------------------------------------
// Category 11 — Use of sold products
// ---------------------------------------------------------------------------

export type UsePhaseComponent = {
  readonly name?: string;
  /** Lifetime uses (or hours/cycles) per unit sold. */
  readonly lifetimeUses: number;
  /** Energy or fuel consumed per use. */
  readonly consumptionPerUse: number;
  readonly consumptionUnit: string;
  readonly factors: ActivityFactorSet;
};

export type Cat11Input = {
  readonly unitsSold: number;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly label?: string;
  /**
   * Direct use-phase: products that consume energy or fuel, or emit GHGs, during
   * use. Mandatory reporting under the GHG Protocol.
   */
  readonly direct?: readonly UsePhaseComponent[];
  /**
   * Indirect use-phase: products that cause energy consumption indirectly (a
   * garment that must be washed, for example). Optional reporting.
   */
  readonly indirect?: readonly UsePhaseComponent[];
};

/**
 * Use of sold products, over the full expected product lifetime, recognised in
 * the year of sale. Direct and indirect use-phase emissions are computed
 * separately because only the direct portion is mandatory to report.
 */
export function calculateCat11UseOfSold(input: Cat11Input): Scope3Computation {
  const definition = scope3Definition("CAT_11_USE_OF_SOLD");
  const approach = input.approach ?? definition.defaultApproach;
  assertApproachSupported("CAT_11_USE_OF_SOLD", approach);

  const label = input.label ?? "Cat 11 use of sold products";
  const direct = input.direct ?? [];
  const indirect = input.indirect ?? [];

  if (direct.length === 0 && indirect.length === 0) {
    throw new CalculationError(
      "Category 11 requires at least one direct or indirect use-phase component",
      {},
    );
  }

  const trace = createTrace();
  let gases = buildGasBreakdown({ gwpVersion: input.gwpVersion });
  let directTotal = 0;
  let indirectTotal = 0;

  const runComponents = (
    components: readonly UsePhaseComponent[],
    kind: "direct" | "indirect",
  ): number => {
    let total = 0;
    for (const component of components) {
      const componentLabel = `${label}: ${kind} ${component.name ?? "use phase"}`;
      const lifetimeConsumption =
        input.unitsSold * component.lifetimeUses * component.consumptionPerUse;

      trace.add({
        stepName: `${componentLabel}: lifetime consumption`,
        formula: "unitsSold × lifetimeUses × consumptionPerUse",
        inputs: {
          unitsSold: input.unitsSold,
          lifetimeUses: component.lifetimeUses,
          consumptionPerUse: component.consumptionPerUse,
          useKind: kind,
        },
        output: lifetimeConsumption,
        unit: component.consumptionUnit,
        notes:
          kind === "indirect"
            ? "Indirect use-phase emissions are optional to report under the GHG Protocol; disclose the boundary chosen."
            : undefined,
      });

      const result = applyFactorSet({
        quantity: lifetimeConsumption,
        unit: component.consumptionUnit,
        factors: component.factors,
        gwpVersion: input.gwpVersion,
        label: componentLabel,
        trace,
      });
      gases = addGasBreakdowns(gases, result.gases);
      total += result.gases.totalCO2e;
    }
    return total;
  };

  directTotal = runComponents(direct, "direct");
  indirectTotal = runComponents(indirect, "indirect");

  trace.add({
    stepName: `${label}: total`,
    formula: "Σ direct use-phase + Σ indirect use-phase",
    inputs: { directTCO2e: directTotal, indirectTCO2e: indirectTotal },
    output: gases.totalCO2e,
    unit: gases.unit,
    notes: "Full-lifetime emissions of products sold in the reporting year.",
  });

  return {
    gases,
    trace: trace.build(),
    scope: "SCOPE_3",
    scope3Category: "CAT_11_USE_OF_SOLD",
    method: "scope3-cat11-lifetime",
  };
}

// ---------------------------------------------------------------------------
// Category 13 — Downstream leased assets
// ---------------------------------------------------------------------------

export function calculateCat13DownstreamLeased(
  input: Scope3ActivityInput,
): Scope3Computation {
  return calculateFromActivity("CAT_13_DOWNSTREAM_LEASED", input);
}

// ---------------------------------------------------------------------------
// Category 14 — Franchises
// ---------------------------------------------------------------------------

export type Cat14Input = {
  readonly franchiseCount: number;
  /** Activity per franchise, e.g. kWh of electricity for an average outlet. */
  readonly quantityPerFranchise: number;
  readonly unit: string;
  readonly factors: ActivityFactorSet;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly label?: string;
  /** Franchisee-reported Scope 1+2 emissions, in tCO2e. */
  readonly supplierReportedTCO2e?: number;
};

/** Franchises: the franchisee's Scope 1 and 2 emissions, scaled by outlet count. */
export function calculateCat14Franchises(input: Cat14Input): Scope3Computation {
  const label = input.label ?? "Cat 14 franchises";
  const totalQuantity = input.franchiseCount * input.quantityPerFranchise;

  const trace = createTrace();
  trace.add({
    stepName: `${label}: scale to the franchise network`,
    formula: "franchiseCount × activity per franchise",
    inputs: {
      franchiseCount: input.franchiseCount,
      quantityPerFranchise: input.quantityPerFranchise,
    },
    output: totalQuantity,
    unit: input.unit,
  });

  return calculateFromActivity(
    "CAT_14_FRANCHISES",
    {
      quantity: totalQuantity,
      unit: input.unit,
      factors: input.factors,
      gwpVersion: input.gwpVersion,
      approach: input.approach,
      label,
      supplierReportedTCO2e: input.supplierReportedTCO2e,
    },
    { trace },
  );
}

// ---------------------------------------------------------------------------
// Category 15 — Investments
// ---------------------------------------------------------------------------

export type Cat15Method = "EQUITY_SHARE" | "INVESTMENT_SPECIFIC" | "AVERAGE_DATA";

export type Cat15Input = {
  readonly method: Cat15Method;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly label?: string;
  /** Investee Scope 1 + 2 emissions, in tCO2e. Required for the first two methods. */
  readonly investeeEmissionsTCO2e?: number;
  /** Equity share held, as a percentage (0–100). */
  readonly equitySharePercent?: number;
  /** PCAF attribution: outstanding amount ÷ total enterprise value. */
  readonly outstandingAmount?: number;
  readonly totalCompanyValue?: number;
  /** Sector-average fallback: amount invested and a per-currency-unit factor. */
  readonly investedAmount?: number;
  readonly investedCurrency?: string;
  readonly factors?: ActivityFactorSet;
};

/**
 * Investments (PCAF-aligned attribution).
 *
 *  - `EQUITY_SHARE`        `investeeEmissions × equityShare`
 *  - `INVESTMENT_SPECIFIC` `investeeEmissions × outstandingAmount ÷ totalCompanyValue`
 *  - `AVERAGE_DATA`        `investedAmount × sector-average factor`
 */
export function calculateCat15Investments(input: Cat15Input): Scope3Computation {
  const label = input.label ?? "Cat 15 investments";
  const trace = createTrace();

  if (input.method === "AVERAGE_DATA") {
    if (input.investedAmount === undefined || !input.factors) {
      throw new CalculationError(
        "The AVERAGE_DATA investment method requires investedAmount and a per-currency factor",
        {},
      );
    }
    trace.add({
      stepName: `${label}: sector-average attribution`,
      formula: "investedAmount × sector-average EF",
      inputs: {
        method: input.method,
        investedAmount: input.investedAmount,
        currency: input.investedCurrency ?? "USD",
      },
      output: input.investedAmount,
      unit: input.investedCurrency ?? "USD",
      notes:
        "Sector-average attribution is PCAF data-quality score 5; replace with investee-reported data when available.",
    });
    return calculateFromActivity(
      "CAT_15_INVESTMENTS",
      {
        quantity: input.investedAmount,
        unit: input.investedCurrency ?? "USD",
        factors: input.factors,
        gwpVersion: input.gwpVersion,
        approach: input.approach ?? "SPEND_BASED",
        label,
      },
      { trace },
    );
  }

  if (input.investeeEmissionsTCO2e === undefined) {
    throw new CalculationError(
      `The ${input.method} investment method requires investeeEmissionsTCO2e`,
      { method: input.method },
    );
  }

  let attributionShare: number;
  let formula: string;
  const inputs: Record<string, number | string | null> = {
    method: input.method,
    investeeEmissionsTCO2e: input.investeeEmissionsTCO2e,
  };

  if (input.method === "EQUITY_SHARE") {
    if (input.equitySharePercent === undefined) {
      throw new CalculationError("EQUITY_SHARE requires equitySharePercent", {});
    }
    if (input.equitySharePercent < 0 || input.equitySharePercent > 100) {
      throw new CalculationError("equitySharePercent must be between 0 and 100", {
        equitySharePercent: input.equitySharePercent,
      });
    }
    attributionShare = input.equitySharePercent / 100;
    formula = "investeeEmissions × equitySharePercent ÷ 100";
    inputs.equitySharePercent = input.equitySharePercent;
  } else {
    if (input.outstandingAmount === undefined || input.totalCompanyValue === undefined) {
      throw new CalculationError(
        "INVESTMENT_SPECIFIC requires outstandingAmount and totalCompanyValue",
        {},
      );
    }
    if (input.totalCompanyValue <= 0) {
      throw new CalculationError("totalCompanyValue must be greater than zero", {
        totalCompanyValue: input.totalCompanyValue,
      });
    }
    attributionShare = input.outstandingAmount / input.totalCompanyValue;
    formula = "investeeEmissions × outstandingAmount ÷ totalCompanyValue";
    inputs.outstandingAmount = input.outstandingAmount;
    inputs.totalCompanyValue = input.totalCompanyValue;
  }

  const attributedTonnes = input.investeeEmissionsTCO2e * attributionShare;
  inputs.attributionShare = attributionShare;

  trace.add({
    stepName: `${label}: attribute investee emissions`,
    formula,
    inputs,
    output: attributedTonnes,
    unit: "tCO2e",
    notes: "PCAF attribution factor applied to the investee's Scope 1 + 2 emissions.",
  });

  const gases = buildGasBreakdown({
    aggregateCo2eKg: attributedTonnes * KG_PER_TONNE,
    gwpVersion: input.gwpVersion,
  });

  trace.add({
    stepName: `${label}: total`,
    formula: "attributed tCO2e",
    inputs: { attributedTonnes },
    output: gases.totalCO2e,
    unit: gases.unit,
  });

  return {
    gases,
    trace: trace.build(),
    scope: "SCOPE_3",
    scope3Category: "CAT_15_INVESTMENTS",
    method: `scope3-cat15-${input.method.toLowerCase().replace(/_/g, "-")}`,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/** Discriminated union of every Scope 3 category input. */
export type Scope3CategoryInput =
  | ({ readonly category: "CAT_1_PURCHASED_GOODS" } & Scope3ActivityInput)
  | ({ readonly category: "CAT_2_CAPITAL_GOODS" } & Scope3ActivityInput)
  | ({ readonly category: "CAT_3_FUEL_ENERGY" } & Cat3Input)
  | ({ readonly category: "CAT_4_UPSTREAM_TRANSPORT" } & FreightInput)
  | ({ readonly category: "CAT_5_WASTE" } & WasteInput)
  | ({ readonly category: "CAT_6_BUSINESS_TRAVEL" } & Cat6Input)
  | ({ readonly category: "CAT_7_EMPLOYEE_COMMUTING" } & Cat7Input)
  | ({ readonly category: "CAT_8_UPSTREAM_LEASED" } & Scope3ActivityInput)
  | ({ readonly category: "CAT_9_DOWNSTREAM_TRANSPORT" } & FreightInput)
  | ({ readonly category: "CAT_10_PROCESSING" } & Cat10Input)
  | ({ readonly category: "CAT_11_USE_OF_SOLD" } & Cat11Input)
  | ({ readonly category: "CAT_12_END_OF_LIFE" } & WasteInput)
  | ({ readonly category: "CAT_13_DOWNSTREAM_LEASED" } & Scope3ActivityInput)
  | ({ readonly category: "CAT_14_FRANCHISES" } & Cat14Input)
  | ({ readonly category: "CAT_15_INVESTMENTS" } & Cat15Input);

/** Routes an input to the engine for its category. */
export function calculateScope3Category(
  input: Scope3CategoryInput,
): Scope3Computation {
  switch (input.category) {
    case "CAT_1_PURCHASED_GOODS":
      return calculateCat1PurchasedGoods(input);
    case "CAT_2_CAPITAL_GOODS":
      return calculateCat2CapitalGoods(input);
    case "CAT_3_FUEL_ENERGY":
      return calculateCat3FuelEnergy(input);
    case "CAT_4_UPSTREAM_TRANSPORT":
      return calculateCat4UpstreamTransport(input);
    case "CAT_5_WASTE":
      return calculateCat5Waste(input);
    case "CAT_6_BUSINESS_TRAVEL":
      return calculateCat6BusinessTravel(input);
    case "CAT_7_EMPLOYEE_COMMUTING":
      return calculateCat7EmployeeCommuting(input);
    case "CAT_8_UPSTREAM_LEASED":
      return calculateCat8UpstreamLeased(input);
    case "CAT_9_DOWNSTREAM_TRANSPORT":
      return calculateCat9DownstreamTransport(input);
    case "CAT_10_PROCESSING":
      return calculateCat10Processing(input);
    case "CAT_11_USE_OF_SOLD":
      return calculateCat11UseOfSold(input);
    case "CAT_12_END_OF_LIFE":
      return calculateCat12EndOfLife(input);
    case "CAT_13_DOWNSTREAM_LEASED":
      return calculateCat13DownstreamLeased(input);
    case "CAT_14_FRANCHISES":
      return calculateCat14Franchises(input);
    case "CAT_15_INVESTMENTS":
      return calculateCat15Investments(input);
    default: {
      // Exhaustiveness guard: adding a category to the enum breaks the build here.
      const exhaustive: never = input;
      throw new CalculationError("Unsupported Scope 3 category", {
        input: exhaustive,
      });
    }
  }
}
