/**
 * Emission-factor semantic search.
 *
 * Prisma has no typed query support for the `vector` column type or the `<=>`
 * cosine-distance operator, so both the write and the read go through raw SQL.
 * The write path has no `withDb` fallback — a write never degrades, it either
 * succeeds against a real database or the caller sees the failure. The read
 * path falls back to a keyword match over the demo fixtures on a database
 * error, the same degrade-gracefully convention every other repository
 * follows — it is not semantic, but it is an honest substitute for an empty
 * result, and it is what makes `/emission-factors` usable in demo mode.
 */

import { getEmbeddingClient } from "@/lib/ai/embeddings/factory";
import { buildEmbeddingText } from "@/lib/ai/embeddings/build-embedding-text";
import type { EmbeddingVector } from "@/lib/ai/embeddings/types";
import type { EmissionFactorLike } from "@/lib/domain/factors/types";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import { DEMO_EMISSION_FACTORS } from "../demo";

/** pgvector's text input format: `[v1,v2,...]`. */
function toVectorLiteral(vector: EmbeddingVector): string {
  return `[${vector.join(",")}]`;
}

/** Generates and stores the embedding for one emission factor. */
export async function upsertEmissionFactorEmbedding(factor: EmissionFactorLike): Promise<void> {
  const client = getEmbeddingClient();
  const { vector, model } = await client.embed(buildEmbeddingText(factor));
  const literal = toVectorLiteral(vector);

  await prisma.$executeRaw`
    INSERT INTO "EmissionFactorEmbedding" ("emissionFactorId", "embedding", "model", "createdAt")
    VALUES (${factor.id}, ${literal}::vector, ${model}, now())
    ON CONFLICT ("emissionFactorId")
    DO UPDATE SET "embedding" = ${literal}::vector, "model" = ${model}, "createdAt" = now()
  `;
}

export type EmissionFactorSearchResult = {
  readonly factor: EmissionFactorLike;
  /** Cosine distance, 0 = identical, for a real search; `null` for the keyword fallback. */
  readonly distance: number | null;
};

type EmissionFactorRow = {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly gasType: string;
  readonly scope: string | null;
  readonly scope3Category: string | null;
  readonly region: string | null;
  readonly country: string | null;
  readonly sector: string | null;
  readonly isActive: boolean;
  readonly distance: number;
};

function toFactorLike(row: EmissionFactorRow): EmissionFactorLike {
  return {
    id: row.id,
    name: row.name,
    value: row.value,
    unit: row.unit as EmissionFactorLike["unit"],
    gasType: row.gasType,
    scope: row.scope as EmissionFactorLike["scope"],
    scope3Category: row.scope3Category as EmissionFactorLike["scope3Category"],
    region: row.region,
    country: row.country,
    sector: row.sector,
    isActive: row.isActive,
  };
}

/** Cosine-similarity search over `EmissionFactorEmbedding`, nearest first. */
export async function searchEmissionFactorsBySimilarity(
  query: string,
  options: { readonly limit?: number } = {},
): Promise<readonly EmissionFactorSearchResult[]> {
  const limit = options.limit ?? 10;
  return withDb<readonly EmissionFactorSearchResult[]>(
    async () => {
      const client = getEmbeddingClient();
      const { vector } = await client.embed(query);
      const literal = toVectorLiteral(vector);

      const rows = await prisma.$queryRaw<readonly EmissionFactorRow[]>`
        SELECT ef.id, ef.name, ef.value, ef.unit, ef."gasType", ef.scope, ef."scope3Category",
               ef.region, ef.country, ef.sector, ef."isActive",
               (efe."embedding" <=> ${literal}::vector) AS distance
        FROM "EmissionFactorEmbedding" efe
        JOIN "EmissionFactor" ef ON ef.id = efe."emissionFactorId"
        ORDER BY efe."embedding" <=> ${literal}::vector
        LIMIT ${limit}
      `;
      return rows.map((row) => ({ factor: toFactorLike(row), distance: row.distance }));
    },
    () => keywordFallback(query, limit),
  );
}

/** Scores demo fixtures by how many query terms appear in their embedding text. */
function keywordFallback(query: string, limit: number): readonly EmissionFactorSearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) return [];

  return DEMO_EMISSION_FACTORS.map((factor) => {
    const haystack = buildEmbeddingText(factor);
    const hits = terms.filter((term) => haystack.includes(term)).length;
    return { factor, hits };
  })
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((entry) => ({ factor: entry.factor, distance: null }));
}
