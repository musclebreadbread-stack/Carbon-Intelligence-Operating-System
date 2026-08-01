import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DB_UNAVAILABLE_CODES,
  canWrite,
  dbUnconfiguredReason,
  getDataMode,
  getEffectiveDataMode,
  getFallbackReason,
  isDbConfigured,
  isDbUnavailableError,
  isDemoMode,
  resetDataMode,
  withDb,
} from "./db";

/** Mimics a Prisma known-request error with a connection code. */
function prismaError(code: string, message = "Prisma error"): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function initializationError(message = "Can't reach database server"): Error {
  const error = new Error(message);
  error.name = "PrismaClientInitializationError";
  return error;
}

const ORIGINAL_URL = process.env.DATABASE_URL;

beforeEach(() => {
  resetDataMode();
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

describe("isDbConfigured", () => {
  it("accepts a real-looking postgres URL", () => {
    expect(isDbConfigured("postgresql://app:s3cret@db.internal:5432/cios")).toBe(true);
    expect(isDbConfigured("postgres://app:s3cret@10.0.0.4:5432/cios?schema=public")).toBe(true);
    expect(isDbConfigured("prisma://accelerate.prisma-data.net/?api_key=abc")).toBe(true);
  });

  it("rejects an absent or blank URL", () => {
    expect(isDbConfigured(undefined)).toBe(false);
    expect(isDbConfigured("")).toBe(false);
    expect(isDbConfigured("   ")).toBe(false);
  });

  it("rejects the placeholder values that ship in .env.local", () => {
    expect(isDbConfigured("postgresql://username:password@localhost:5432/cios")).toBe(false);
    expect(isDbConfigured("postgresql://user:password@localhost:5432/db")).toBe(false);
    expect(isDbConfigured("postgresql://placeholder")).toBe(false);
    expect(isDbConfigured("postgresql://your-host:5432/db")).toBe(false);
    expect(isDbConfigured("postgresql://<host>:5432/db")).toBe(false);
    expect(isDbConfigured("postgresql://changeme@localhost/db")).toBe(false);
  });

  it("rejects a non-postgres protocol", () => {
    expect(isDbConfigured("mysql://app:pw@localhost:3306/cios")).toBe(false);
    expect(isDbConfigured("file:./dev.db")).toBe(false);
  });
});

describe("isDbUnavailableError", () => {
  it("recognises every documented connection error code", () => {
    for (const code of DB_UNAVAILABLE_CODES) {
      expect(isDbUnavailableError(prismaError(code)), code).toBe(true);
    }
  });

  it("recognises PrismaClientInitializationError by name", () => {
    expect(isDbUnavailableError(initializationError())).toBe(true);
  });

  it("recognises a missing DATABASE_URL by message", () => {
    expect(
      isDbUnavailableError(new Error("error: Environment variable not found: DATABASE_URL.")),
    ).toBe(true);
  });

  it("does not swallow a query error the caller should see", () => {
    // P2002 is a unique-constraint violation: a real bug, not a missing database.
    expect(isDbUnavailableError(prismaError("P2002"))).toBe(false);
    expect(isDbUnavailableError(new Error("Invalid `prisma.user.findMany()` invocation"))).toBe(
      false,
    );
    expect(isDbUnavailableError(null)).toBe(false);
    expect(isDbUnavailableError("boom")).toBe(false);
  });
});

describe("withDb", () => {
  it("returns the query result and stays in database mode", async () => {
    process.env.DATABASE_URL = "postgresql://app:s3cret@db.internal:5432/cios";
    const result = await withDb(
      async () => ["from-db"],
      () => ["from-fixture"],
    );
    expect(result).toEqual(["from-db"]);
    expect(getDataMode()).toBe("database");
    expect(isDemoMode()).toBe(false);
    expect(getFallbackReason()).toBeNull();
  });

  it("falls back to fixtures and reports demo mode on a P1001", async () => {
    process.env.DATABASE_URL = "postgresql://app:s3cret@db.internal:5432/cios";
    const result = await withDb(
      async () => {
        throw prismaError("P1001", "Can't reach database server at db.internal:5432");
      },
      () => ["from-fixture"],
    );
    expect(result).toEqual(["from-fixture"]);
    expect(getDataMode()).toBe("demo");
    expect(isDemoMode()).toBe(true);
    expect(getFallbackReason()).toMatch(/Can't reach database server/);
  });

  it("does not even attempt the query when DATABASE_URL is a placeholder", async () => {
    process.env.DATABASE_URL = "postgresql://username:password@localhost:5432/cios";
    let attempted = false;
    const result = await withDb(
      async () => {
        attempted = true;
        return ["from-db"];
      },
      () => ["from-fixture"],
    );
    expect(attempted).toBe(false);
    expect(result).toEqual(["from-fixture"]);
    expect(getDataMode()).toBe("demo");
    expect(getFallbackReason()).toBe("DATABASE_URL is a placeholder value");
  });

  it("reports the unset URL distinctly from a placeholder", async () => {
    delete process.env.DATABASE_URL;
    await withDb(
      async () => "db",
      () => "fixture",
    );
    expect(getFallbackReason()).toBe("DATABASE_URL is not set");
  });

  it("rethrows an error that is not a connection failure", async () => {
    process.env.DATABASE_URL = "postgresql://app:s3cret@db.internal:5432/cios";
    await expect(
      withDb(
        async () => {
          throw prismaError("P2002", "Unique constraint failed");
        },
        () => "fixture",
      ),
    ).rejects.toThrow(/Unique constraint failed/);
    // A real query error must not flip the process into demo mode.
    expect(getDataMode()).toBe("database");
  });

  it("returns to database mode once the connection recovers", async () => {
    process.env.DATABASE_URL = "postgresql://app:s3cret@db.internal:5432/cios";
    await withDb(
      async () => {
        throw prismaError("P1017");
      },
      () => "fixture",
    );
    expect(getDataMode()).toBe("demo");

    await withDb(
      async () => "db",
      () => "fixture",
    );
    expect(getDataMode()).toBe("database");
    expect(getFallbackReason()).toBeNull();
  });

  it("only materialises the fixture graph when it is needed", async () => {
    process.env.DATABASE_URL = "postgresql://app:s3cret@db.internal:5432/cios";
    let fixtureBuilt = 0;
    await withDb(
      async () => "db",
      () => {
        fixtureBuilt += 1;
        return "fixture";
      },
    );
    expect(fixtureBuilt).toBe(0);
  });
});

describe("canWrite", () => {
  it("allows writes when the database is configured", async () => {
    process.env.DATABASE_URL = "postgresql://app:s3cret@db.internal:5432/cios";
    await expect(canWrite()).resolves.toBe(true);
  });

  it("refuses writes and flags demo mode when it is not", async () => {
    delete process.env.DATABASE_URL;
    await expect(canWrite()).resolves.toBe(false);
    expect(getDataMode()).toBe("demo");
  });
});

/**
 * `dbUnconfiguredReason` and `getEffectiveDataMode` (defect 1).
 *
 * `getDataMode()` reports the *observed* mode and starts optimistically at
 * `"database"`, because nothing has entered demo mode until a read has actually failed.
 * That is right for the demo-mode banner, which reports what happened, and wrong for
 * anything answering "can this be written to?" before the first read — which is exactly
 * what `GET /api/v1/health` and the API response envelope do.
 */
describe("dbUnconfiguredReason", () => {
  it("returns null for a usable URL", () => {
    expect(dbUnconfiguredReason("postgresql://app:s3cret@db.internal:5432/cios")).toBeNull();
  });

  it("distinguishes absent from placeholder, which is what an operator needs to know", () => {
    expect(dbUnconfiguredReason(undefined)).toBe("DATABASE_URL is not set");
    expect(dbUnconfiguredReason("")).toBe("DATABASE_URL is not set");
    expect(dbUnconfiguredReason("   ")).toBe("DATABASE_URL is not set");
    expect(
      dbUnconfiguredReason("postgresql://placeholder:placeholder@localhost:5432/placeholder"),
    ).toBe("DATABASE_URL is a placeholder value");
  });

  it("is the single source of the wording withDb records", async () => {
    // If these drifted, the banner and the health endpoint would explain the same
    // situation two different ways.
    delete process.env.DATABASE_URL;
    await withDb(
      async () => "live",
      () => "fixture",
    );
    expect(getFallbackReason()).toBe(dbUnconfiguredReason());
  });

  it("has no side effect on the observed mode", () => {
    delete process.env.DATABASE_URL;
    dbUnconfiguredReason();
    expect(getDataMode()).toBe("database");
  });
});

describe("getEffectiveDataMode", () => {
  it("reports demo on a fresh process with no DATABASE_URL, before any read", () => {
    // The regression: the observed mode is still the optimistic default here.
    delete process.env.DATABASE_URL;
    expect(getDataMode()).toBe("database");
    expect(getEffectiveDataMode()).toBe("demo");
  });

  it("reports demo for a placeholder URL", () => {
    process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
    expect(getEffectiveDataMode()).toBe("demo");
  });

  it("reports database when a usable URL is set and nothing has fallen back", () => {
    process.env.DATABASE_URL = "postgresql://app:s3cret@db.internal:5432/cios";
    expect(getEffectiveDataMode()).toBe("database");
  });

  it("follows the observed mode once a configured database proves unreachable", async () => {
    process.env.DATABASE_URL = "postgresql://app:s3cret@db.internal:5432/cios";
    await withDb(
      async () => {
        throw prismaError("P1001");
      },
      () => "fixture",
    );
    expect(getEffectiveDataMode()).toBe("demo");
    expect(isDemoMode()).toBe(true);
  });

  it("does not itself flip the process into demo mode", () => {
    delete process.env.DATABASE_URL;
    getEffectiveDataMode();
    expect(getDataMode()).toBe("database");
  });
});
