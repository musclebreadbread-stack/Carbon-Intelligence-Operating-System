/**
 * The gateway's authentication and envelope behaviour.
 *
 * The key properties: a missing, unknown, revoked or expired key is 401 and the
 * handler never runs; a valid key reaches the handler with a `SessionUser` carrying
 * the same roles the UI would see; the rate limiter is applied per key *after*
 * authentication; and no error path ever leaks a raw driver message.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/core/errors";

const findApiKeyByHash = vi.fn();
const touchApiKey = vi.fn();
const sessionFromApiKey = vi.fn();

vi.mock("@/lib/data/repositories/security", () => ({
  findApiKeyByHash: (...args: unknown[]) => findApiKeyByHash(...args),
  touchApiKey: (...args: unknown[]) => touchApiKey(...args),
}));

vi.mock("@/lib/auth/session", () => ({
  sessionFromApiKey: (...args: unknown[]) => sessionFromApiKey(...args),
  isSupabaseConfigured: () => false,
}));

import { z } from "zod";

import { apiRateLimiter } from "@/lib/api/rate-limit";
import { hashApiKey } from "@/lib/security/field-crypto";

import {
  apiErrorFor,
  bearerToken,
  fromActionState,
  jsonError,
  jsonOk,
  parseBody,
  parseQuery,
  withApiKey,
} from "./handler";

const TOKEN = "cios_live_abc123_secretsecretsecret";
const ORGANIZATION_ID = "org-1";

const PRINCIPAL = {
  id: "key-1",
  organizationId: ORGANIZATION_ID,
  userId: "user-1",
  name: "Integration key",
  scopes: ["credits:retire"],
  isActive: true,
  expiresAt: null as Date | null,
};

const SESSION = {
  userId: "user-1",
  email: "integration@example.com",
  name: "Integration",
  organizationId: ORGANIZATION_ID,
  organizationName: "Demo",
  isActive: true,
  roles: [
    {
      id: "role-reader",
      name: "reader",
      permissions: [{ resource: "calculation", action: "read" }],
    },
  ],
  accessPolicies: [],
  source: "apiKey" as const,
  scopes: PRINCIPAL.scopes,
};

function request(
  options: {
    readonly token?: string | null;
    readonly url?: string;
    readonly method?: string;
    readonly body?: unknown;
    readonly rawBody?: string;
  } = {},
): Request {
  const headers = new Headers();
  if (options.token !== null) {
    headers.set("authorization", `Bearer ${options.token ?? TOKEN}`);
  }
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.rawBody !== undefined) {
    init.body = options.rawBody;
    headers.set("content-type", "application/json");
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    headers.set("content-type", "application/json");
  }
  return new Request(options.url ?? "http://localhost/api/v1/calculations", init);
}

beforeEach(() => {
  apiRateLimiter.reset();
  findApiKeyByHash.mockReset();
  touchApiKey.mockReset();
  sessionFromApiKey.mockReset();

  findApiKeyByHash.mockResolvedValue({ ...PRINCIPAL });
  touchApiKey.mockResolvedValue(undefined);
  sessionFromApiKey.mockResolvedValue(SESSION);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bearerToken", () => {
  it("extracts the token from a Bearer header, case-insensitively", () => {
    expect(bearerToken(request())).toBe(TOKEN);
    expect(
      bearerToken(
        new Request("http://localhost/x", {
          headers: { authorization: `bearer ${TOKEN}` },
        }),
      ),
    ).toBe(TOKEN);
  });

  it("returns null for a missing, empty or non-Bearer header", () => {
    expect(bearerToken(request({ token: null }))).toBeNull();
    expect(
      bearerToken(new Request("http://localhost/x", { headers: { authorization: "Bearer " } })),
    ).toBeNull();
    expect(
      bearerToken(
        new Request("http://localhost/x", { headers: { authorization: `Basic ${TOKEN}` } }),
      ),
    ).toBeNull();
  });
});

describe("withApiKey — authentication", () => {
  it("rejects a request with no Authorization header as 401", async () => {
    const handler = vi.fn();
    const response = await withApiKey(handler)(request({ token: null }));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(handler).not.toHaveBeenCalled();
    // An unauthenticated request must not enter the bucket map at all.
    expect(apiRateLimiter.size).toBe(0);
  });

  it("rejects an unknown key as 401 without running the handler", async () => {
    findApiKeyByHash.mockResolvedValue(null);
    const handler = vi.fn();

    const response = await withApiKey(handler)(request());

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("compares only the digest, never the plaintext token", async () => {
    await withApiKey(async () => jsonOk({}))(request());

    expect(findApiKeyByHash).toHaveBeenCalledWith(hashApiKey(TOKEN));
    // The plaintext must never reach the data layer.
    expect(findApiKeyByHash).not.toHaveBeenCalledWith(TOKEN);
  });

  it("rejects a revoked key as 401", async () => {
    findApiKeyByHash.mockResolvedValue({ ...PRINCIPAL, isActive: false });
    const handler = vi.fn();

    const response = await withApiKey(handler)(request());

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("revoked");
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects an expired key as 401", async () => {
    findApiKeyByHash.mockResolvedValue({
      ...PRINCIPAL,
      expiresAt: new Date(Date.now() - 1_000),
    });
    const handler = vi.fn();

    const response = await withApiKey(handler)(request());

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("expired");
    expect(handler).not.toHaveBeenCalled();
  });

  it("accepts a key whose expiry is still in the future", async () => {
    findApiKeyByHash.mockResolvedValue({
      ...PRINCIPAL,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await withApiKey(async () => jsonOk({ ok: true }))(request());

    expect(response.status).toBe(200);
  });

  it("rejects a key whose owner is no longer active", async () => {
    sessionFromApiKey.mockResolvedValue(null);
    const handler = vi.fn();

    const response = await withApiKey(handler)(request());

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes a valid key through with its session and organization", async () => {
    const handler = vi.fn(async () => jsonOk({ ok: true }));

    const response = await withApiKey(handler)(request());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const context = (handler.mock.calls as unknown as unknown[][])[0]?.[0] as {
      session: typeof SESSION;
      organizationId: string;
      apiKeyId: string;
      scopes: readonly string[];
    };
    expect(context.organizationId).toBe(ORGANIZATION_ID);
    expect(context.apiKeyId).toBe(PRINCIPAL.id);
    expect(context.scopes).toEqual(PRINCIPAL.scopes);
    // The API and the UI share one authorisation model.
    expect(context.session.roles[0]?.name).toBe("reader");
  });

  it("records the key's use without letting a failure refuse the request", async () => {
    touchApiKey.mockRejectedValue(new Error("db is read-only"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await withApiKey(async () => jsonOk({ ok: true }))(request());

    expect(response.status).toBe(200);
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("withApiKey — scopes and permissions", () => {
  it("rejects a key missing the required scope as 403", async () => {
    const handler = vi.fn();

    const response = await withApiKey(handler, { scope: "admin:write" })(request());

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a session without the required permission as 403", async () => {
    const handler = vi.fn();

    const response = await withApiKey(handler, {
      resource: "carbon_credit",
      action: "retire",
    })(request());

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("admits a session that holds the required permission", async () => {
    const handler = vi.fn(async () => jsonOk({ ok: true }));

    const response = await withApiKey(handler, {
      resource: "calculation",
      action: "read",
    })(request());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("withApiKey — rate limiting", () => {
  it("sets the X-RateLimit headers on a successful response", async () => {
    const response = await withApiKey(async () => jsonOk({ ok: true }))(request());

    expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("59");
    expect(response.headers.get("X-RateLimit-Reset")).not.toBeNull();
    expect(response.headers.get("Retry-After")).toBeNull();
  });

  it("returns 429 with Retry-After once the quota is spent", async () => {
    const endpoint = withApiKey(async () => jsonOk({ ok: true }));

    for (let index = 0; index < 60; index += 1) {
      const allowed = await endpoint(request());
      expect(allowed.status).toBe(200);
    }

    const refused = await endpoint(request());
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).not.toBeNull();
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    const body = (await refused.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("charges an endpoint's declared cost against the key's bucket", async () => {
    const endpoint = withApiKey(async () => jsonOk({ ok: true }), { cost: 10 });

    const response = await endpoint(request());

    expect(response.headers.get("X-RateLimit-Remaining")).toBe("50");
  });

  it("keeps quotas separate per API key", async () => {
    const endpoint = withApiKey(async () => jsonOk({ ok: true }), { cost: 60 });

    await endpoint(request());
    expect((await endpoint(request())).status).toBe(429);

    // A second key must be unaffected by the first key exhausting its quota.
    findApiKeyByHash.mockResolvedValue({ ...PRINCIPAL, id: "key-2" });
    expect((await endpoint(request())).status).toBe(200);
  });

  it("does not rate-limit before authentication succeeds", async () => {
    findApiKeyByHash.mockResolvedValue(null);
    const endpoint = withApiKey(async () => jsonOk({ ok: true }));

    for (let index = 0; index < 100; index += 1) {
      const response = await endpoint(request());
      expect(response.status).toBe(401);
    }
    expect(apiRateLimiter.size).toBe(0);
  });
});

describe("jsonOk / jsonError envelopes", () => {
  it("wraps data with a meta block carrying the version and data mode", async () => {
    const response = jsonOk({ id: "x" });
    const body = (await response.json()) as {
      data: { id: string };
      meta: { version: string; dataMode: string };
    };

    expect(body.data.id).toBe("x");
    expect(body.meta.version).toBe("v1");
    expect(body.meta.dataMode).toBeDefined();
  });

  it("adds a count for an array payload", async () => {
    const response = jsonOk([1, 2, 3]);
    const body = (await response.json()) as { meta: { count: number } };
    expect(body.meta.count).toBe(3);
  });

  it("maps each error code to its conventional status", async () => {
    expect(jsonError("UNAUTHORIZED", "x").status).toBe(401);
    expect(jsonError("FORBIDDEN", "x").status).toBe(403);
    expect(jsonError("INVALID_REQUEST", "x").status).toBe(422);
    expect(jsonError("NOT_FOUND", "x").status).toBe(404);
    expect(jsonError("RATE_LIMITED", "x").status).toBe(429);
    expect(jsonError("DEMO_MODE", "x").status).toBe(503);
    expect(jsonError("INTERNAL_ERROR", "x").status).toBe(500);
  });
});

describe("apiErrorFor", () => {
  it("maps an authorisation failure to FORBIDDEN, not UNAUTHORIZED", () => {
    // At this point the key authenticated, so the failure is a 403.
    expect(apiErrorFor(new UnauthorizedError("Not permitted: no role")).code).toBe(
      "FORBIDDEN",
    );
  });

  it("maps validation and not-found errors to their codes", () => {
    expect(apiErrorFor(new ValidationError("bad")).code).toBe("INVALID_REQUEST");
    expect(apiErrorFor(new NotFoundError("gone")).code).toBe("NOT_FOUND");
  });

  it("withholds an unexpected error's message", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mapped = apiErrorFor(new Error("relation \"public.User\" does not exist"));

    expect(mapped.code).toBe("INTERNAL_ERROR");
    // A raw driver message would disclose the schema.
    expect(mapped.message).not.toContain("public.User");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns 500 without leaking the message when a handler throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await withApiKey(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
    })(request());

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("10.0.0.5");
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("parseQuery", () => {
  const schema = z.object({
    reportingYear: z.coerce.number().int().optional(),
    scopes: z.array(z.string()).optional(),
  });

  it("coerces scalars and collapses repeated parameters into arrays", () => {
    const parsed = parseQuery(
      request({ url: "http://localhost/x?reportingYear=2024&scopes=A&scopes=B" }),
      schema,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected a parsed query");
    expect(parsed.data.reportingYear).toBe(2024);
    expect(parsed.data.scopes).toEqual(["A", "B"]);
  });

  it("returns a 422 with field errors for an invalid query", async () => {
    const parsed = parseQuery(
      request({ url: "http://localhost/x?reportingYear=not-a-year" }),
      schema,
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected a rejection");
    expect(parsed.response.status).toBe(422);
    const body = (await parsed.response.json()) as {
      error: { details: { fieldErrors: Record<string, string[]> } };
    };
    expect(body.error.details.fieldErrors).toHaveProperty("reportingYear");
  });
});

describe("parseBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("parses a valid JSON body", async () => {
    const parsed = await parseBody(
      request({ method: "POST", body: { name: "ok" } }),
      schema,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected a parsed body");
    expect(parsed.data.name).toBe("ok");
  });

  it("reports malformed JSON as 422 rather than throwing", async () => {
    const parsed = await parseBody(
      request({ method: "POST", rawBody: "{not json" }),
      schema,
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected a rejection");
    expect(parsed.response.status).toBe(422);
    const body = (await parsed.response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("valid JSON");
  });

  it("reports a schema failure with field errors", async () => {
    const parsed = await parseBody(
      request({ method: "POST", body: { name: "" } }),
      schema,
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected a rejection");
    const body = (await parsed.response.json()) as {
      error: { details: { fieldErrors: Record<string, string[]> } };
    };
    expect(body.error.details.fieldErrors).toHaveProperty("name");
  });
});

describe("fromActionState", () => {
  it("translates a successful action state, honouring the status override", async () => {
    const response = fromActionState(
      { status: "success", data: { id: "x" }, message: "Created" },
      { status: 201 },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      data: { id: string };
      meta: { message: string };
    };
    expect(body.data.id).toBe("x");
    expect(body.meta.message).toBe("Created");
  });

  it("maps every action error code onto a gateway status", () => {
    const cases: readonly [string, number][] = [
      ["UNAUTHORIZED", 401],
      ["FORBIDDEN", 403],
      ["VALIDATION_ERROR", 422],
      ["NOT_FOUND", 404],
      ["DEMO_MODE", 503],
      ["RATE_LIMITED", 429],
      ["CALCULATION_ERROR", 422],
      ["INTERNAL_ERROR", 500],
    ];
    for (const [code, status] of cases) {
      expect(fromActionState({ status: "error", code, message: "x" }).status).toBe(status);
    }
  });

  it("carries an action's field errors into the error details", async () => {
    const response = fromActionState({
      status: "error",
      code: "VALIDATION_ERROR",
      message: "invalid",
      fieldErrors: { name: ["Required"] },
    });

    const body = (await response.json()) as {
      error: { details: { fieldErrors: Record<string, string[]> } };
    };
    expect(body.error.details.fieldErrors.name).toEqual(["Required"]);
  });
});
