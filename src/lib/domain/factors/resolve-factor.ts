/**
 * Versioned emission-factor resolution.
 *
 * A candidate is eligible only if every attribute it *declares* matches the
 * criteria (a `null` attribute means "generic, applies anywhere"), it is active,
 * and the activity date falls inside its validity window.
 *
 * Eligible candidates are then ranked by specificity:
 *
 *   organization-specific > supplier-specific > country > region > global
 *
 * with a small bonus for a sector match, and ties broken by the newest
 * `validFrom`, then the better `dataQuality`, then the factor id (so the result
 * is deterministic and reproducible in an audit).
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { DataQualityLevel } from "@/lib/core/enums";
import { NotFoundError } from "@/lib/core/errors";
import { FACTOR_DENOMINATOR_UNIT } from "@/lib/reference/units";

import { isConvertible } from "../units/convert";
import {
  FACTOR_SPECIFICITY,
  type EmissionFactorLike,
  type FactorCriteria,
  type FactorSelection,
  type FactorSpecificity,
} from "./types";

/** Bonus for a factor that names the criteria's sector explicitly. */
const SECTOR_BONUS = 2;

const DATA_QUALITY_RANK: Readonly<Record<DataQualityLevel, number>> = {
  HIGH: 5,
  MEDIUM: 4,
  LOW: 3,
  ESTIMATED: 2,
  DEFAULT: 1,
};

function sameKey(a?: string | null, b?: string | null): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Denominator unit of a factor, e.g. `KG_CO2E_PER_KWH` → `kWh`. */
export function factorDenominatorUnit(factor: EmissionFactorLike): string | undefined {
  return FACTOR_DENOMINATOR_UNIT[factor.unit];
}

/** Reason a candidate is ineligible, or `undefined` when it passes. */
function rejectionReason(
  factor: EmissionFactorLike,
  criteria: FactorCriteria,
): string | undefined {
  if (factor.isActive === false && !criteria.includeInactive) {
    return "factor is inactive";
  }
  const at = criteria.date.getTime();
  if (factor.validFrom && at < factor.validFrom.getTime()) {
    return `not yet valid at ${criteria.date.toISOString()} (validFrom ${factor.validFrom.toISOString()})`;
  }
  if (factor.validTo && at > factor.validTo.getTime()) {
    return `expired at ${criteria.date.toISOString()} (validTo ${factor.validTo.toISOString()})`;
  }
  if (factor.scope && factor.scope !== criteria.scope) {
    return `scope ${factor.scope} does not match ${criteria.scope}`;
  }
  if (factor.scope3Category && factor.scope3Category !== criteria.scope3Category) {
    return `scope 3 category ${factor.scope3Category} does not match ${criteria.scope3Category ?? "none"}`;
  }
  if (factor.organizationId && !sameKey(factor.organizationId, criteria.organizationId)) {
    return "belongs to another organization";
  }
  if (factor.supplierId && !sameKey(factor.supplierId, criteria.supplierId)) {
    return "belongs to another supplier";
  }
  if (factor.country && !sameKey(factor.country, criteria.country)) {
    return `country ${factor.country} does not match ${criteria.country ?? "none"}`;
  }
  if (factor.region && !sameKey(factor.region, criteria.region)) {
    return `region ${factor.region} does not match ${criteria.region ?? "none"}`;
  }
  if (factor.sector && !sameKey(factor.sector, criteria.sector)) {
    return `sector ${factor.sector} does not match ${criteria.sector ?? "none"}`;
  }
  if (criteria.sourceId && !sameKey(factor.sourceId, criteria.sourceId)) {
    return `source ${factor.sourceId ?? "none"} does not match required source ${criteria.sourceId}`;
  }
  if (criteria.gasType && !sameKey(factor.gasType, criteria.gasType)) {
    return `gas ${factor.gasType} does not match ${criteria.gasType}`;
  }
  if (criteria.unit) {
    const denominator = factorDenominatorUnit(factor);
    if (!denominator) {
      return `unknown denominator unit for ${factor.unit}`;
    }
    if (!isConvertible(criteria.unit, denominator)) {
      return `denominator ${denominator} is not convertible from activity unit ${criteria.unit}`;
    }
  }
  return undefined;
}

function specificityOf(
  factor: EmissionFactorLike,
  criteria: FactorCriteria,
): FactorSpecificity {
  if (factor.organizationId && sameKey(factor.organizationId, criteria.organizationId)) {
    return "ORGANIZATION_SPECIFIC";
  }
  if (factor.supplierId && sameKey(factor.supplierId, criteria.supplierId)) {
    return "SUPPLIER_SPECIFIC";
  }
  if (factor.country && sameKey(factor.country, criteria.country)) return "COUNTRY";
  if (factor.region && sameKey(factor.region, criteria.region)) return "REGION";
  return "GLOBAL";
}

function scoreOf(factor: EmissionFactorLike, criteria: FactorCriteria): number {
  const base = FACTOR_SPECIFICITY[specificityOf(factor, criteria)];
  const sectorBonus = factor.sector && sameKey(factor.sector, criteria.sector) ? SECTOR_BONUS : 0;
  return base + sectorBonus;
}

function compareCandidates(
  a: EmissionFactorLike,
  b: EmissionFactorLike,
  criteria: FactorCriteria,
): number {
  const byScore = scoreOf(b, criteria) - scoreOf(a, criteria);
  if (byScore !== 0) return byScore;

  // Newest validFrom wins; a missing validFrom is treated as the oldest possible.
  const byValidFrom =
    (b.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY) -
    (a.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY);
  if (byValidFrom !== 0) return byValidFrom;

  const byQuality =
    (b.dataQuality ? DATA_QUALITY_RANK[b.dataQuality] : 0) -
    (a.dataQuality ? DATA_QUALITY_RANK[a.dataQuality] : 0);
  if (byQuality !== 0) return byQuality;

  // Final deterministic tie-break so repeated runs pick the same factor.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Selects the applicable factor, or returns `null` when nothing matches.
 * Prefer this over `resolveFactor` when a miss is an expected outcome.
 */
export function tryResolveFactor(
  candidates: readonly EmissionFactorLike[],
  criteria: FactorCriteria,
): FactorSelection | null {
  const eligible: EmissionFactorLike[] = [];
  const rejected: { factorId: string; reason: string }[] = [];

  for (const candidate of candidates) {
    const reason = rejectionReason(candidate, criteria);
    if (reason) {
      rejected.push({ factorId: candidate.id, reason });
    } else {
      eligible.push(candidate);
    }
  }

  if (eligible.length === 0) return null;

  const ranked = [...eligible].sort((a, b) => compareCandidates(a, b, criteria));
  const [winner, ...runnersUp] = ranked;
  const specificity = specificityOf(winner, criteria);
  const score = scoreOf(winner, criteria);

  const selectionRationale: string[] = [
    `Evaluated ${candidates.length} candidate factor(s); ${eligible.length} eligible after validity, scope and dimension filters.`,
    `Selected "${winner.name}" (${winner.id}) at ${specificity} specificity (score ${score}).`,
    `Valid ${winner.validFrom ? winner.validFrom.toISOString().slice(0, 10) : "open"} to ${
      winner.validTo ? winner.validTo.toISOString().slice(0, 10) : "open"
    }; activity date ${criteria.date.toISOString().slice(0, 10)} falls inside the window.`,
    `Factor value ${winner.value} ${winner.unit}${
      winner.gasType ? ` for gas ${winner.gasType}` : ""
    }${winner.dataQuality ? `, data quality ${winner.dataQuality}` : ""}.`,
  ];

  if (runnersUp.length > 0) {
    const next = runnersUp[0];
    selectionRationale.push(
      `Preferred over ${runnersUp.length} lower-ranked candidate(s), next best "${next.name}" (${next.id}) at ${specificityOf(
        next,
        criteria,
      )} specificity (score ${scoreOf(next, criteria)}).`,
    );
  }
  for (const entry of rejected) {
    selectionRationale.push(`Excluded ${entry.factorId}: ${entry.reason}.`);
  }

  return { factor: winner, specificity, score, selectionRationale, runnersUp, rejected };
}

/**
 * Selects the applicable factor for the given criteria.
 * @throws NotFoundError when no candidate is eligible.
 */
export function resolveFactor(
  candidates: readonly EmissionFactorLike[],
  criteria: FactorCriteria,
): FactorSelection {
  const selection = tryResolveFactor(candidates, criteria);
  if (!selection) {
    throw new NotFoundError(
      `No applicable emission factor for scope ${criteria.scope}${
        criteria.scope3Category ? ` / ${criteria.scope3Category}` : ""
      } at ${criteria.date.toISOString().slice(0, 10)}`,
      {
        candidateCount: candidates.length,
        criteria: {
          date: criteria.date.toISOString(),
          scope: criteria.scope,
          scope3Category: criteria.scope3Category ?? null,
          region: criteria.region ?? null,
          country: criteria.country ?? null,
          sector: criteria.sector ?? null,
          unit: criteria.unit ?? null,
        },
      },
    );
  }
  return selection;
}
