/**
 * Structural types for emission-factor resolution.
 *
 * `EmissionFactorLike` mirrors the columns of the `EmissionFactor` model so a
 * Prisma row is assignable to it, but the domain never imports `@prisma/client`
 * — that is what keeps the resolver unit-testable without a database.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type {
  DataQualityLevel,
  EmissionFactorUnit,
  GHGScope,
  Scope3Category,
} from "@/lib/core/enums";

export type EmissionFactorLike = {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly unit: EmissionFactorUnit;
  /** `"CO2e"` for an aggregated factor, or a `GreenhouseGas` key for a per-gas factor. */
  readonly gasType: string;
  readonly scope?: GHGScope | null;
  readonly scope3Category?: Scope3Category | null;
  readonly region?: string | null;
  readonly country?: string | null;
  readonly sector?: string | null;
  readonly validFrom?: Date | null;
  readonly validTo?: Date | null;
  readonly isActive?: boolean;
  readonly uncertainty?: number | null;
  readonly dataQuality?: DataQualityLevel | null;
  readonly organizationId?: string | null;
  readonly sourceId?: string | null;
  readonly categoryId?: string | null;
  readonly versionId?: string | null;
  /**
   * Optional supplier association. Not a column on `EmissionFactor`; the
   * persistence layer supplies it when a factor was loaded from a supplier's
   * primary data (`SupplierEmissionData`), so that supplier-specific factors can
   * outrank national averages.
   */
  readonly supplierId?: string | null;
};

export type FactorCriteria = {
  /** Date the activity occurred, checked against `validFrom`/`validTo`. */
  readonly date: Date;
  readonly scope: GHGScope;
  readonly scope3Category?: Scope3Category | null;
  readonly region?: string | null;
  readonly country?: string | null;
  readonly sector?: string | null;
  readonly organizationId?: string | null;
  readonly supplierId?: string | null;
  /**
   * Unit of the activity quantity. When given, a candidate is only eligible if
   * its denominator unit is convertible to this unit.
   */
  readonly unit?: string | null;
  /** Restrict to a single emission-factor source, e.g. "DEFRA 2024". */
  readonly sourceId?: string | null;
  /** Restrict to a specific gas, e.g. `"CH4"`; defaults to any. */
  readonly gasType?: string | null;
  /** Include factors flagged `isActive: false`. Off by default. */
  readonly includeInactive?: boolean;
};

/**
 * Specificity tiers, most to least specific. The numeric values are the ranking
 * weights used by the resolver and are deliberately spaced so a sector bonus can
 * never promote a factor across a tier boundary.
 */
export const FACTOR_SPECIFICITY = {
  ORGANIZATION_SPECIFIC: 50,
  SUPPLIER_SPECIFIC: 40,
  COUNTRY: 30,
  REGION: 20,
  GLOBAL: 10,
} as const;

export type FactorSpecificity = keyof typeof FACTOR_SPECIFICITY;

export type FactorSelection = {
  readonly factor: EmissionFactorLike;
  readonly specificity: FactorSpecificity;
  /** Ranking score; higher wins. Exposed for auditability, not for display. */
  readonly score: number;
  /** Ordered, human-readable justification for the audit trail. */
  readonly selectionRationale: readonly string[];
  /** Candidates that passed the filters but lost the ranking, best first. */
  readonly runnersUp: readonly EmissionFactorLike[];
  /** Candidates excluded by a hard filter, with the reason. */
  readonly rejected: readonly { readonly factorId: string; readonly reason: string }[];
};
