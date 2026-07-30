import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DB_UNAVAILABLE_CODES,
  canWrite,
  getDataMode,
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
