/**
 * Shared plumbing for the `/api/v1` gateway.
 *
 * `_lib` is a private folder, so Next never routes it — the underscore prefix opts
 * a directory out of the router while leaving it importable.
 *
 * The gateway authenticates with `Authorization: Bearer <apiKey>` against the
 * `APIKey` model (decision 10), which is a different principal model from the UI's
 * Supabase session. Everything downstream of authentication is shared: the resolved
 * key becomes a `SessionUser` via `sessionFromApiKey`, so `can()` / `requirePermission()`
 * evaluate exactly the same roles and policies the UI does. There is no second
 * authorisation model to keep in sync.
 *
 * Every response uses one envelope — `{ data, meta }` or `{ error }` — so a client
 * can branch on shape without inspecting the status code.
 */

import { NextResponse } from "next/server";
import type { z } from "zod";

import { AppError } from "@/lib/core/errors";
import { sessionFromApiKey, type SessionUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/rbac";
import { getEffectiveDataMode } from "@/lib/data/db";
import { findApiKeyByHash, touchApiKey } from "@/lib/data/repositories/security";
import { hashApiKey } from "@/lib/security/field-crypto";
import {
  apiRateLimiter,
  rateLimitForKey,
  rateLimitHeaders,
  type RateLimitDecision,
} from "@/lib/api/rate-limit";
import { fieldErrors } from "@/lib/validation";

export const API_VERSION = "v1";

/** Machine-readable error codes the gateway returns. */
export const API_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID_REQUEST",
  "NOT_FOUND",
  "RATE_LIMITED",
  "DEMO_MODE",
  "METHOD_NOT_ALLOWED",
  "INTERNAL_ERROR",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const STATUS_FOR_CODE: Readonly<Record<ApiErrorCode, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 422,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  DEMO_MODE: 503,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_ERROR: 500,
};

export type ApiMeta = {
  readonly version: string;
  /**
   * `getEffectiveDataMode()`, not `getDataMode()`. The observed mode starts
   * optimistically at `"database"`, so an unconfigured deployment used to report
   * `"dataMode":"database"` in the meta block of every response while refusing every
   * write — a client checking this field to decide whether to POST was misled.
   */
  readonly dataMode: string;
  readonly count?: number;
  readonly organizationId?: string;
  readonly [key: string]: unknown;
};

/** Success envelope. */
export function jsonOk<T>(
  data: T,
  init: {
    readonly status?: number;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly headers?: Readonly<Record<string, string>>;
  } = {},
): NextResponse {
  const meta: ApiMeta = {
    version: API_VERSION,
    dataMode: getEffectiveDataMode(),
    ...(Array.isArray(data) ? { count: data.length } : {}),
    ...init.meta,
  };
  return NextResponse.json(
    { data, meta },
    { status: init.status ?? 200, headers: { ...init.headers } },
  );
}

/** Error envelope. Never carries an unexpected error's message. */
export function jsonError(
  code: ApiErrorCode,
  message: string,
  init: {
    readonly status?: number;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly headers?: Readonly<Record<string, string>>;
  } = {},
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(init.details ? { details: init.details } : {}),
      },
      meta: { version: API_VERSION, dataMode: getEffectiveDataMode() },
    },
    { status: init.status ?? STATUS_FOR_CODE[code], headers: { ...init.headers } },
  );
}

/** Maps a thrown `AppError` onto the gateway's codes. */
export function apiErrorFor(error: unknown): {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
} {
  if (error instanceof AppError) {
    switch (error.code) {
      case "UNAUTHORIZED":
        return { code: "FORBIDDEN", message: error.message };
      case "VALIDATION_ERROR":
      case "TOOL_INPUT_INVALID":
        return {
          code: "INVALID_REQUEST",
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        };
      case "NOT_FOUND":
      case "TOOL_NOT_FOUND":
        return { code: "NOT_FOUND", message: error.message };
      case "LLM_RATE_LIMITED":
        return { code: "RATE_LIMITED", message: error.message };
      case "CALCULATION_ERROR":
        return {
          code: "INVALID_REQUEST",
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        };
      default:
        return { code: "INTERNAL_ERROR", message: error.message };
    }
  }
  // Message withheld: a raw driver error can disclose schema details.
  console.error("[api] unhandled error", error);
  return { code: "INTERNAL_ERROR", message: "An unexpected error occurred." };
}

/** What an authenticated handler receives. */
export type ApiContext = {
  readonly request: Request;
  readonly session: SessionUser;
  readonly organizationId: string;
  readonly apiKeyId: string;
  readonly scopes: readonly string[];
  /** Headers the wrapper will merge into whatever the handler returns. */
  readonly rateLimit: RateLimitDecision;
};

export type ApiHandler = (context: ApiContext) => Promise<NextResponse>;

export type WithApiKeyOptions = {
  /** Permission the caller must hold, checked before the handler runs. */
  readonly resource?: string;
  readonly action?: string;
  /** Scope the key itself must carry, beyond its owner's roles. */
  readonly scope?: string;
  /** Tokens this endpoint costs; a calculation run is heavier than a list. */
  readonly cost?: number;
  /** Injected for tests. */
  readonly now?: () => number;
};

const BEARER_PREFIX = /^Bearer\s+/i;

/** Extracts the presented token, or `null` when the header is absent or malformed. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !BEARER_PREFIX.test(header)) return null;
  const token = header.replace(BEARER_PREFIX, "").trim();
  return token.length > 0 ? token : null;
}

/**
 * Wraps a route handler with API-key authentication, rate limiting and the shared
 * error envelope.
 *
 * The order is deliberate: authenticate first, then rate limit *per key*. Rate
 * limiting an unauthenticated request by IP would let one caller exhaust another's
 * quota through a shared NAT, and admitting an unauthenticated request into the
 * bucket map would make the map an unbounded memory sink for anyone who can send
 * requests.
 */
export function withApiKey(handler: ApiHandler, options: WithApiKeyOptions = {}): (
  request: Request,
) => Promise<NextResponse> {
  return async (request: Request): Promise<NextResponse> => {
    try {
      const token = bearerToken(request);
      if (!token) {
        return jsonError(
          "UNAUTHORIZED",
          "Supply an API key as `Authorization: Bearer <key>`.",
        );
      }

      // Only the digest is ever compared; the plaintext never reaches the data
      // layer and is never logged.
      const principal = await findApiKeyByHash(hashApiKey(token));
      if (!principal) {
        return jsonError("UNAUTHORIZED", "The API key is not recognised.");
      }
      if (!principal.isActive) {
        return jsonError("UNAUTHORIZED", "The API key has been revoked.");
      }
      if (principal.expiresAt !== null && principal.expiresAt.getTime() <= Date.now()) {
        return jsonError("UNAUTHORIZED", "The API key has expired.");
      }
      if (options.scope && !principal.scopes.includes(options.scope)) {
        return jsonError(
          "FORBIDDEN",
          `The API key does not carry the "${options.scope}" scope.`,
        );
      }

      const decision = apiRateLimiter.consume(principal.id, {
        limit: rateLimitForKey(principal.scopes, { keyLimit: principal.rateLimit }),
        ...(options.cost !== undefined ? { cost: options.cost } : {}),
        ...(options.now !== undefined ? { now: options.now } : {}),
      });
      if (!decision.allowed) {
        return jsonError("RATE_LIMITED", "Rate limit exceeded for this API key.", {
          headers: rateLimitHeaders(decision),
        });
      }

      const session = await sessionFromApiKey(principal);
      if (!session) {
        return jsonError(
          "UNAUTHORIZED",
          "The API key's owner is no longer an active user.",
          { headers: rateLimitHeaders(decision) },
        );
      }

      if (options.resource && options.action) {
        try {
          requirePermission(session, options.resource, options.action, {
            organizationId: session.organizationId,
          });
        } catch (error) {
          const mapped = apiErrorFor(error);
          return jsonError(mapped.code, mapped.message, {
            headers: rateLimitHeaders(decision),
          });
        }
      }

      // Recorded after authorisation so a refused call does not look like a use.
      // Failure to record is not a reason to refuse the request.
      void touchApiKey(principal.id).catch((error: unknown) => {
        console.error("[api] failed to record API key use", error);
      });

      const response = await handler({
        request,
        session,
        organizationId: session.organizationId,
        apiKeyId: principal.id,
        scopes: principal.scopes,
        rateLimit: decision,
      });

      for (const [name, value] of Object.entries(rateLimitHeaders(decision))) {
        response.headers.set(name, value);
      }
      return response;
    } catch (error) {
      const mapped = apiErrorFor(error);
      return jsonError(mapped.code, mapped.message, {
        ...(mapped.details ? { details: mapped.details } : {}),
      });
    }
  };
}

/**
 * Parses the query string with a zod schema.
 *
 * Repeated parameters collapse into arrays so `?scopes=SCOPE_1&scopes=SCOPE_2`
 * works, which is what an array schema expects.
 */
export function parseQuery<T>(
  request: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): { readonly ok: true; readonly data: T } | { readonly ok: false; readonly response: NextResponse } {
  const url = new URL(request.url);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    raw[key] = values.length > 1 ? values : (values[0] as string);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError("INVALID_REQUEST", "The query parameters are not valid.", {
        details: { fieldErrors: fieldErrors(parsed.error) },
      }),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Parses a JSON body with a zod schema, reporting a malformed body as 422. */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonError("INVALID_REQUEST", "The request body is not valid JSON."),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError("INVALID_REQUEST", "The request body is not valid.", {
        details: { fieldErrors: fieldErrors(parsed.error) },
      }),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Turns an item-30 `ActionState` into a response.
 *
 * This is what stops the gateway duplicating any domain logic: an endpoint that
 * mutates calls the same action the UI calls and translates its result.
 */
export function fromActionState<T>(
  state:
    | { readonly status: "success"; readonly data: T; readonly message: string }
    | {
        readonly status: "error";
        readonly code: string;
        readonly message: string;
        readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
      },
  init: { readonly status?: number } = {},
): NextResponse {
  if (state.status === "success") {
    return jsonOk(state.data, {
      ...(init.status !== undefined ? { status: init.status } : {}),
      meta: { message: state.message },
    });
  }
  const code: ApiErrorCode =
    state.code === "UNAUTHORIZED"
      ? "UNAUTHORIZED"
      : state.code === "FORBIDDEN"
        ? "FORBIDDEN"
        : state.code === "VALIDATION_ERROR"
          ? "INVALID_REQUEST"
          : state.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : state.code === "DEMO_MODE"
              ? "DEMO_MODE"
              : state.code === "RATE_LIMITED"
                ? "RATE_LIMITED"
                : state.code === "CALCULATION_ERROR"
                  ? "INVALID_REQUEST"
                  : "INTERNAL_ERROR";
  return jsonError(code, state.message, {
    ...(state.fieldErrors ? { details: { fieldErrors: state.fieldErrors } } : {}),
  });
}
