/**
 * `getDataMode()` only reflects the *last* query's outcome, so right after a
 * cold start — before any repository has run a query — it can report
 * "database" even when the database is actually unreachable. `reachable`
 * comes from an active probe (`checkDatabaseConnectivity`) instead, so an
 * operator sees the real state rather than a stale guess.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: async () => undefined };
});

const queryRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}));

import { resetDataMode } from "@/lib/data/db";

import { GET } from "./route";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

async function body(response: Response): Promise<{
  readonly data: { readonly database: { readonly configured: boolean; readonly reachable: boolean } };
}> {
  return response.json();
}

describe("GET /api/v1/health", () => {
  it("reports unreachable when DATABASE_URL is not configured, without querying", async () => {
    delete process.env.DATABASE_URL;

    const { data } = await body(await GET());

    expect(data.database.configured).toBe(false);
    expect(data.database.reachable).toBe(false);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("reports reachable when the probe query succeeds", async () => {
    process.env.DATABASE_URL = REAL_URL;
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const { data } = await body(await GET());

    expect(data.database.configured).toBe(true);
    expect(data.database.reachable).toBe(true);
  });

  it("reports unreachable when the probe query fails, even though DATABASE_URL is configured (cold-start regression)", async () => {
    process.env.DATABASE_URL = REAL_URL;
    queryRaw.mockRejectedValue(new Error("Can't reach database server"));

    const { data } = await body(await GET());

    expect(data.database.configured).toBe(true);
    expect(data.database.reachable).toBe(false);
  });
});
