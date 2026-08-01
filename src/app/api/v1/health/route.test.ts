/**
 * `GET /api/v1/health`.
 *
 * This endpoint had no test coverage at all, which is how defect 1 survived: on a
 * fresh process with no `DATABASE_URL` it answered `"mode":"database"` and
 * `"writable":true`, because it read the *observed* `getDataMode()` — which starts
 * optimistically at `"database"` and only flips once some repository read has gone
 * through `withDb()` and failed. `/api-gateway` rendered "Accepting writes: yes"
 * from that while every mutation was being refused with `DEMO_MODE`.
 *
 * Three contracts are pinned here:
 *
 *  1. the report is conservative — it never claims writability that the mutation
 *     path would not honour;
 *  2. it is side-effect free — asking about health must not push the process into
 *     demo mode, or a load-balancer probe would change application behaviour;
 *  3. the shape CI's `zero-config` job greps for (`"database":{"configured":false`)
 *     is preserved, including the key order the `case` statement depends on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` opts the handler out of prerendering. Outside a request scope it
// throws, so it is stubbed; the assertion that it is *called* is below.
const connection = vi.fn(async () => undefined);

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: () => connection() };
});

import { getDataMode, resetDataMode, withDb } from "@/lib/data/db";

import { GET } from "./route";

type HealthBody = {
  readonly data: {
    readonly status: string;
    readonly database: {
      readonly configured: boolean;
      readonly mode: string;
      readonly fallbackReason: string | null;
    };
    readonly supabase: { readonly configured: boolean };
    readonly llm: {
      readonly configured: boolean;
      readonly mode: string;
      readonly model: string;
      readonly label: string;
      readonly labelKo: string;
    };
    readonly writable: boolean;
  };
  readonly meta: { readonly version: string; readonly dataMode: string };
};

const ORIGINAL_URL = process.env.DATABASE_URL;
const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";

async function health(): Promise<HealthBody> {
  const response = await GET();
  expect(response.status).toBe(200);
  return (await response.json()) as HealthBody;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

describe("GET /api/v1/health with no DATABASE_URL", () => {
  it("reports demo mode and refuses to claim writability on a fresh process", async () => {
    // The regression: nothing has read through `withDb()` yet, so the observed mode
    // is still the optimistic default.
    expect(getDataMode()).toBe("database");

    const body = await health();

    expect(body.data.database.configured).toBe(false);
    expect(body.data.database.mode).toBe("demo");
    expect(body.data.writable).toBe(false);
  });

  it("explains why it is serving fixtures", async () => {
    const body = await health();

    expect(body.data.database.fallbackReason).toBe("DATABASE_URL is not set");
  });

  it("distinguishes a placeholder URL from an absent one", async () => {
    process.env.DATABASE_URL =
      "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public";

    const body = await health();

    expect(body.data.database.configured).toBe(false);
    expect(body.data.writable).toBe(false);
    expect(body.data.database.fallbackReason).toBe("DATABASE_URL is a placeholder value");
  });

  it("does not put the process into demo mode as a side effect of being asked", async () => {
    // A load-balancer probe must not change application behaviour.
    await health();

    expect(getDataMode()).toBe("database");
  });

  it("still answers 200, because an unconfigured deployment is not an unhealthy one", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthBody;
    expect(body.data.status).toBe("ok");
  });

  it("keeps the exact JSON shape CI's zero-config job greps for", async () => {
    // `.github/workflows/ci.yml` matches the literal substring
    // `"database":{"configured":false` — so `configured` has to stay the first key
    // of the `database` object. Asserting the serialised text, not the parsed
    // object, is the only way to catch a key reorder.
    const response = await GET();
    const text = await response.text();

    expect(text).toContain('"database":{"configured":false');
  });
});

describe("GET /api/v1/health with a usable DATABASE_URL", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = REAL_URL;
  });

  it("reports database mode and accepts writes", async () => {
    const body = await health();

    expect(body.data.database.configured).toBe(true);
    expect(body.data.database.mode).toBe("database");
    expect(body.data.database.fallbackReason).toBeNull();
    expect(body.data.writable).toBe(true);
  });

  it("reports the observed fallback once a read has actually failed", async () => {
    // A configured but unreachable database: `withDb` records the reachability
    // failure, and that is more specific than any configuration reason.
    const p1001 = new Error("Can't reach database server at db.internal:5432") as Error & {
      code: string;
    };
    p1001.code = "P1001";
    await withDb(
      async () => {
        throw p1001;
      },
      () => "fixtures",
    );

    const body = await health();

    expect(body.data.database.configured).toBe(true);
    expect(body.data.database.mode).toBe("demo");
    expect(body.data.writable).toBe(false);
    expect(body.data.database.fallbackReason).toContain("Can't reach database server");
  });
});

describe("GET /api/v1/health envelope and dependency reporting", () => {
  it("opts out of prerendering with connection()", async () => {
    await health();

    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("uses the shared success envelope", async () => {
    const body = await health();

    expect(body.meta.version).toBe("v1");
    expect(body.meta.dataMode).toBeDefined();
  });

  it("reports the same mode in the envelope as in the payload", async () => {
    // The envelope had the same bug in a quieter place: `meta.dataMode` read the
    // observed mode, so every API response said `"dataMode":"database"` on an
    // unconfigured deployment while refusing every write. A client using that field
    // to decide whether to POST was misled.
    const body = await health();

    expect(body.meta.dataMode).toBe("demo");
    expect(body.data.database.mode).toBe("demo");
  });

  it("reports Supabase and the LLM as unconfigured with no credentials present", async () => {
    const body = await health();

    expect(body.data.supabase.configured).toBe(false);
    expect(body.data.llm.configured).toBe(false);
    // The deterministic client is the documented fallback, not an error state.
    expect(body.data.llm.mode).toBe("deterministic");
    expect(body.data.llm.label.length).toBeGreaterThan(0);
    // The Korean label exists so the settings page and the setup guide share wording.
    expect(body.data.llm.labelKo.length).toBeGreaterThan(0);
  });

  it("leaks no URL, key or key prefix", async () => {
    process.env.DATABASE_URL = REAL_URL;

    const response = await GET();
    const text = await response.text();

    // The response must never let an unauthenticated caller fingerprint the
    // deployment or recover a credential.
    expect(text).not.toContain("s3cret");
    expect(text).not.toContain("db.internal");
    expect(text).not.toContain("postgresql://");
  });

  it("requires no authentication", async () => {
    // No `Authorization` header is passed and the handler takes no request: a
    // first-time operator has to be able to ask "is this misconfigured?" before any
    // API key exists.
    await expect(GET()).resolves.toBeDefined();
  });
});
