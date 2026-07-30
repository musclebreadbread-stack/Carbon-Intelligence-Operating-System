/**
 * Reference data the seed writes: rows that are the *same for every tenant*.
 *
 * Everything here is derived from the in-repo reference tables rather than
 * hand-retyped, so a correction to `src/lib/reference/**` or to the disclosure
 * catalogue propagates to a seeded database without anyone remembering to update a
 * second copy. That is the whole reason this module holds derivations and not
 * literals.
 *
 * Pure data — no Prisma client, no `process.env`, no I/O — so the integrity test can
 * import it directly.
 */

import type {
  CalculationApproach,
  GHGScope,
  ReportingFramework,
  Scope3Category,
} from "@/lib/core/enums";
import { DISCLOSURE_REQUIREMENTS } from "@/lib/domain/disclosure/requirements";
import { FRAMEWORK_DEFINITIONS } from "@/lib/reference/frameworks";
import { SCOPE3_CATEGORY_DEFINITIONS } from "@/lib/reference/scope3-categories";
import { UNIT_CONVERSIONS } from "@/lib/reference/units";

// ---------------------------------------------------------------------------
// Unit conversions
// ---------------------------------------------------------------------------

/** One row of `UnitConversion`; unique on `[fromUnit, toUnit]`. */
export type UnitConversionSeed = {
  readonly fromUnit: string;
  readonly toUnit: string;
  readonly factor: number;
  readonly category: string;
  readonly description: string | null;
};

export const UNIT_CONVERSION_SEEDS: readonly UnitConversionSeed[] = UNIT_CONVERSIONS.map(
  (row) => ({
    fromUnit: row.fromUnit,
    toUnit: row.toUnit,
    factor: row.factor,
    category: row.category,
    description: row.description ?? null,
  }),
);

// ---------------------------------------------------------------------------
// Scope 3 category configuration
// ---------------------------------------------------------------------------

/** One row of `Scope3CategoryConfig`; unique on `category`. */
export type Scope3ConfigSeed = {
  readonly category: Scope3Category;
  readonly name: string;
  readonly description: string;
  readonly isRelevant: boolean;
  readonly methodology: string;
  readonly dataSource: string;
  readonly notes: string;
};

/**
 * All fifteen categories are seeded with `isRelevant: true`.
 *
 * A screening assessment is what decides relevance, and seeding a category as
 * irrelevant would silently exclude it from the inventory before anyone had
 * screened it — the opposite of the GHG Protocol's default. Marking a category
 * irrelevant is a deliberate, audited act performed in the UI.
 */
export const SCOPE3_CONFIG_SEEDS: readonly Scope3ConfigSeed[] =
  SCOPE3_CATEGORY_DEFINITIONS.map((definition) => ({
    category: definition.category,
    name: `${definition.number}. ${definition.nameEn} / ${definition.nameKo}`,
    description: definition.descriptionKo,
    isRelevant: true,
    methodology: definition.defaultApproach,
    dataSource: definition.requiredFields.join(", "),
    notes: `${definition.side}; supported approaches: ${definition.supportedApproaches.join(", ")}`,
  }));

// ---------------------------------------------------------------------------
// Calculation methodologies and formulas
// ---------------------------------------------------------------------------

export type CalculationFormulaSeed = {
  readonly name: string;
  readonly expression: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly description: string;
  readonly applicableScope: GHGScope | null;
};

/** One row of `CalculationMethodology`; unique on `[name, version]`. */
export type CalculationMethodologySeed = {
  readonly name: string;
  readonly version: string;
  readonly framework: ReportingFramework;
  readonly description: string;
  readonly formula: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly sourceUrl: string;
  readonly isDefault: boolean;
  readonly formulas: readonly CalculationFormulaSeed[];
};

/**
 * The methodologies the engines implement, one per scope, with the formula strings
 * the calculation traces emit.
 *
 * These are documentation rows: the arithmetic lives in `domain/emissions/**`. They
 * exist so a verifier reading the database can see which published method each
 * calculation claims to follow, and so `EmissionCalculation.methodologyId` has
 * something meaningful to point at.
 */
export const CALCULATION_METHODOLOGY_SEEDS: readonly CalculationMethodologySeed[] = [
  {
    name: "GHG Protocol Corporate Standard — Scope 1",
    version: "2015-revised",
    framework: "GHG_PROTOCOL",
    description:
      "Direct emissions from owned or controlled sources: stationary combustion, mobile combustion, process emissions and fugitive releases.",
    formula: "E = Σ (activity × factor × GWP)",
    parameters: { gwpVersion: "AR6", biogenicReportedSeparately: true },
    sourceUrl: "https://ghgprotocol.org/corporate-standard",
    isDefault: true,
    formulas: [
      {
        name: "Stationary combustion",
        expression: "E_gas = fuel × NCV × EF_gas",
        variables: {
          fuel: "Fuel consumed in its reported unit",
          NCV: "Net calorific value, MJ per unit",
          EF_gas: "Gas-specific emission factor, kg per TJ",
        },
        description:
          "IPCC 2006 Guidelines Vol. 2 Ch. 2 tier 1: fuel energy content multiplied by the default gas factor.",
        applicableScope: "SCOPE_1",
      },
      {
        name: "Mobile combustion",
        expression: "E_gas = (fuel × EF_gas) or (distance × EF_distance)",
        variables: {
          fuel: "Fuel consumed by the vehicle",
          distance: "Distance travelled, when fuel use is unknown",
          EF_gas: "Fuel-based factor",
          EF_distance: "Distance-based factor",
        },
        description:
          "IPCC 2006 Guidelines Vol. 2 Ch. 3. Fuel-based is preferred; distance-based is the fallback.",
        applicableScope: "SCOPE_1",
      },
      {
        name: "Fugitive refrigerant — screening",
        expression: "E = (inventoryChange + purchases − disposals) × GWP",
        variables: {
          inventoryChange: "Opening less closing charge held in storage",
          purchases: "Refrigerant acquired in the period",
          disposals: "Refrigerant sent for destruction or reclaim",
          GWP: "100-year global warming potential of the gas",
        },
        description:
          "GHG Protocol screening (sales-based) method for refrigerant losses.",
        applicableScope: "SCOPE_1",
      },
      {
        name: "Process emissions",
        expression: "E = production × EF_process",
        variables: {
          production: "Physical output of the process",
          EF_process: "Process-specific factor per unit of output",
        },
        description:
          "IPCC 2006 Guidelines Vol. 3 (Industrial Processes and Product Use) tier 1.",
        applicableScope: "SCOPE_1",
      },
    ],
  },
  {
    name: "GHG Protocol Scope 2 Guidance — dual reporting",
    version: "2015",
    framework: "GHG_PROTOCOL",
    description:
      "Purchased electricity, steam, heat and cooling, reported on both the location-based and the market-based method.",
    formula: "E_location = consumption × gridFactor ; E_market = Σ (instrument × factor)",
    parameters: { dualReporting: true, recOversupplyClampedAtZero: true },
    sourceUrl: "https://ghgprotocol.org/scope-2-guidance",
    isDefault: true,
    formulas: [
      {
        name: "Location-based",
        expression: "E = consumption × gridAverageFactor",
        variables: {
          consumption: "Electricity consumed, MWh",
          gridAverageFactor: "Grid average factor for the year and region",
        },
        description:
          "The grid average the site physically draws from, regardless of contracts.",
        applicableScope: "SCOPE_2_LOCATION",
      },
      {
        name: "Market-based",
        expression:
          "E = max(0, (consumption − Σ instruments) × residualMix + Σ (instrument × instrumentFactor))",
        variables: {
          instruments: "Contractual instruments: supplier-specific, RECs/GOs, PPAs",
          residualMix: "Residual-mix factor for the uncovered remainder",
          instrumentFactor: "Factor attached to each instrument",
        },
        description:
          "Contractual instruments applied in the Scope 2 Guidance hierarchy, clamped at zero so oversupplied certificates cannot create negative emissions.",
        applicableScope: "SCOPE_2_MARKET",
      },
    ],
  },
  {
    name: "GHG Protocol Corporate Value Chain (Scope 3) Standard",
    version: "2011",
    framework: "GHG_PROTOCOL",
    description:
      "Fifteen value-chain categories, each supporting spend-based, average-data, supplier-specific and hybrid approaches.",
    formula: "E = Σ_category Σ_entry (activity × factor)",
    parameters: { categories: 15, defaultApproach: "ACTIVITY_BASED" },
    sourceUrl: "https://ghgprotocol.org/corporate-value-chain-scope-3-standard",
    isDefault: true,
    formulas: [
      {
        name: "Spend-based",
        expression: "E = spend × EF_spend",
        variables: {
          spend: "Procurement spend in the factor's currency and base year",
          EF_spend: "Environmentally-extended input-output factor per currency unit",
        },
        description:
          "Screening approach used where physical activity data is unavailable; the least accurate tier.",
        applicableScope: "SCOPE_3",
      },
      {
        name: "Average-data",
        expression: "E = mass × EF_material",
        variables: {
          mass: "Physical quantity purchased",
          EF_material: "Industry-average cradle-to-gate factor per unit mass",
        },
        description: "Physical activity data with an industry-average factor.",
        applicableScope: "SCOPE_3",
      },
      {
        name: "Supplier-specific",
        expression: "E = quantity × EF_supplier",
        variables: {
          quantity: "Quantity bought from that supplier",
          EF_supplier: "Factor derived from the supplier's own verified inventory",
        },
        description:
          "Primary data from the supplier; the highest-quality tier and the one the data-quality rubric rewards.",
        applicableScope: "SCOPE_3",
      },
      {
        name: "Category 3 — well-to-tank",
        expression: "E = Σ (scope1And2Activity × EF_upstream)",
        variables: {
          scope1And2Activity: "Fuel and electricity already reported in Scope 1 and 2",
          EF_upstream: "Upstream (WTT) factor for that carrier",
        },
        description:
          "Derived from the Scope 1 and 2 activity so the two can never disagree.",
        applicableScope: "SCOPE_3",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Disclosure frameworks and their requirement catalogues
// ---------------------------------------------------------------------------

export type DisclosureRequirementSeed = {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly isMandatory: boolean;
  readonly dataType: string;
  readonly guidance: string | null;
};

/** One row of `DisclosureFramework`; unique on `[code, version]`. */
export type DisclosureFrameworkSeed = {
  readonly code: ReportingFramework;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly publisher: string;
  readonly url: string;
  readonly isActive: boolean;
  readonly requirements: readonly DisclosureRequirementSeed[];
};

/** Framework home pages, so every seeded framework carries a citation. */
const FRAMEWORK_URLS: Readonly<Record<ReportingFramework, string>> = {
  GHG_PROTOCOL: "https://ghgprotocol.org/corporate-standard",
  ISO_14064: "https://www.iso.org/standard/66453.html",
  ISSB_S1: "https://www.ifrs.org/issued-standards/ifrs-sustainability-standards-navigator/ifrs-s1-general-requirements/",
  ISSB_S2: "https://www.ifrs.org/issued-standards/ifrs-sustainability-standards-navigator/ifrs-s2-climate-related-disclosures/",
  CDP: "https://www.cdp.net/en/guidance",
  CSRD: "https://finance.ec.europa.eu/capital-markets-union-and-financial-markets/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en",
  ESRS: "https://www.efrag.org/en/sustainability-reporting",
  TCFD: "https://www.fsb-tcfd.org/publications/",
  GRI: "https://www.globalreporting.org/standards/",
  SASB: "https://sasb.ifrs.org/standards/",
  TNFD: "https://tnfd.global/publications/",
};

/**
 * `DisclosureFramework` rows with their `DisclosureRequirement` children.
 *
 * Every framework in the Prisma enum gets a row so a report can be created for it,
 * but only the mapped ones get requirements. TNFD deliberately seeds with an empty
 * catalogue: pretending it has requirements would let a user generate a TNFD report
 * that scores 0 % complete rather than being told the framework is not mapped yet.
 */
export const DISCLOSURE_FRAMEWORK_SEEDS: readonly DisclosureFrameworkSeed[] =
  FRAMEWORK_DEFINITIONS.map((definition) => {
    const groupNames = new Map(
      definition.requirementGroups.map((group) => [
        group.code,
        `${group.nameEn} / ${group.nameKo}`,
      ]),
    );
    return {
      code: definition.framework,
      name: `${definition.nameEn} / ${definition.nameKo}`,
      version: definition.version,
      description: `${definition.kind} framework published by ${definition.publisher}.${
        definition.isMandatory ? " Legally mandated in at least one jurisdiction." : ""
      }`,
      publisher: definition.publisher,
      url: FRAMEWORK_URLS[definition.framework],
      isActive: true,
      requirements: DISCLOSURE_REQUIREMENTS.filter(
        (requirement) => requirement.framework === definition.framework,
      ).map((requirement) => ({
        code: requirement.code,
        name: `${requirement.name} / ${requirement.nameKo}`,
        description: requirement.description,
        category: requirement.category,
        isMandatory: requirement.isMandatory,
        dataType: requirement.dataType,
        guidance:
          requirement.guidance ??
          // Falls back to the requirement group's own name, which is more useful
          // to a drafter than a null.
          groupNames.get(requirement.category) ??
          null,
      })),
    };
  });

/** Approaches referenced by the seeded Scope 3 configs, for the integrity test. */
export const SEEDED_SCOPE3_APPROACHES: readonly CalculationApproach[] =
  SCOPE3_CATEGORY_DEFINITIONS.map((definition) => definition.defaultApproach);
