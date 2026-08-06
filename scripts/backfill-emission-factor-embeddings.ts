/**
 * One-off backfill: generates and stores an embedding for every `EmissionFactor`
 * that does not have one yet.
 *
 * Requires a live, pgvector-enabled database — there is no demo-mode path for a
 * write. Run once after `npx prisma migrate deploy` introduces
 * `EmissionFactorEmbedding`, and again after bulk-loading a new factor library.
 *
 * Not run in CI or by any test: it needs `DATABASE_URL` to point at a real
 * Postgres instance with the `vector` extension enabled.
 */

import { getEmbeddingMode } from "@/lib/ai/embeddings/factory";
import { upsertEmissionFactorEmbedding } from "@/lib/data/repositories/emission-factor-search";
import { prisma } from "@/lib/prisma";

async function main(): Promise<void> {
  const mode = getEmbeddingMode();
  console.log(`Embedding mode: ${mode}${mode === "deterministic" ? " (set OPENAI_API_KEY for real embeddings)" : ""}`);

  const factors = await prisma.emissionFactor.findMany({
    where: { embedding: { is: null } },
    select: {
      id: true,
      name: true,
      value: true,
      unit: true,
      gasType: true,
      scope: true,
      scope3Category: true,
      region: true,
      country: true,
      sector: true,
      isActive: true,
    },
  });

  console.log(`${factors.length} factor(s) have no embedding yet.`);

  let done = 0;
  for (const factor of factors) {
    await upsertEmissionFactorEmbedding(factor);
    done += 1;
    if (done % 50 === 0 || done === factors.length) {
      console.log(`  ${done} / ${factors.length}`);
    }
  }

  console.log(`Backfilled ${done} embedding(s).`);
}

const invokedDirectly = (process.argv[1] ?? "").endsWith("backfill-emission-factor-embeddings.ts");
if (invokedDirectly) {
  void main()
    .then(() => prisma.$disconnect())
    .catch(async (error: unknown) => {
      console.error("Failed to backfill emission-factor embeddings:", error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
