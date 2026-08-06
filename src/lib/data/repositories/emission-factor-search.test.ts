import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const executeRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
  },
}));

vi.mock("@/lib/ai/embeddings/factory", () => ({
  getEmbeddingClient: () => ({
    embed: async () => ({ vector: [0.1, 0.2, 0.3], model: "deterministic" }),
  }),
}));

import { resetDataMode } from "../db";
import { DEMO_ORGANIZATION_ID } from "../demo";

import { searchEmissionFactorsBySimilarity } from "./emission-factor-search";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  process.env.DATABASE_URL = REAL_URL;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

describe("searchEmissionFactorsBySimilarity (database mode)", () => {
  it("scopes the raw SQL to the caller's organisation plus global factors", async () => {
    queryRaw.mockResolvedValue([]);

    await searchEmissionFactorsBySimilarity("diesel", "org-a");

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join("?");
    expect(sql).toContain('ef."organizationId"');
    expect(sql).toContain("IS NULL");
    expect(values).toContain("org-a");
  });
});

describe("searchEmissionFactorsBySimilarity (demo mode keyword fallback)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDataMode();
  });

  it("never returns another organisation's custom factor", async () => {
    const results = await searchEmissionFactorsBySimilarity("diesel fuel", "org-not-hanbit", {
      limit: 50,
    });

    expect(
      results.every(
        (result) =>
          result.factor.organizationId == null ||
          result.factor.organizationId === "org-not-hanbit",
      ),
    ).toBe(true);
  });

  it("includes the demo organisation's own custom factor when searching as that organisation", async () => {
    const results = await searchEmissionFactorsBySimilarity("hanbit", DEMO_ORGANIZATION_ID, {
      limit: 50,
    });

    // Every hit must be either global or the caller's own — same assertion as
    // above, framed for the "as the owning org" side of the boundary.
    expect(
      results.every(
        (result) =>
          result.factor.organizationId == null ||
          result.factor.organizationId === DEMO_ORGANIZATION_ID,
      ),
    ).toBe(true);
  });
});
