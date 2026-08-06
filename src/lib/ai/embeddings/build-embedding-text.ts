/**
 * Builds the text an `EmissionFactor` is embedded from.
 *
 * A single normalised sentence rather than the raw row, so two factors that
 * differ only in casing or field order embed identically — deliberate for the
 * deterministic client, and it is also what a real embedding model does better
 * with than a loose bag of fields.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { EmissionFactorLike } from "@/lib/domain/factors/types";

export function buildEmbeddingText(factor: EmissionFactorLike): string {
  const parts = [
    factor.name,
    factor.sector ? `sector: ${factor.sector}` : null,
    factor.scope ? `scope: ${factor.scope}` : null,
    factor.scope3Category ? `category: ${factor.scope3Category}` : null,
    factor.region ? `region: ${factor.region}` : null,
    factor.country ? `country: ${factor.country}` : null,
    `gas: ${factor.gasType}`,
    `unit: ${factor.unit}`,
  ].filter((part): part is string => part !== null);

  return parts.join("; ").toLowerCase();
}
