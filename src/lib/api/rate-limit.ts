/**
 * In-memory token-bucket rate limiter for the REST gateway.
 *
 * A token bucket rather than a fixed window, because a fixed window lets a client
 * spend its whole quota in the last millisecond of one window and again in the
 * first millisecond of the next — a 2× burst the origin has to absorb. A bucket
 * refills continuously, so the sustained rate is the configured rate and the burst
 * is bounded by the capacity.
 *
 * Deliberately process-local: this holds a single Node process to its quota, which
 * is the honest guarantee a serverless or multi-instance deployment can make
 * without Redis. The Korean setup guide documents swapping in a shared store; the
 * `RateLimiter` interface is what a Redis implementation would satisfy.
 *
 * Pure TypeScript with an injectable clock — no Next, no Prisma, no `Date.now()`
 * baked in, so the refill behaviour is directly assertable.
 */

/** Default sustained rate, applied when a key declares none. */
export const DEFAULT_RATE_LIMIT = 60;

/** Default window the rate is expressed over. */
export const DEFAULT_WINDOW_MS = 60_000;

export type RateLimitDecision = {
  readonly allowed: boolean;
  /** The configured ceiling, for the `X-RateLimit-Limit` header. */
  readonly limit: number;
  /** Whole tokens left after this decision, for `X-RateLimit-Remaining`. */
  readonly remaining: number;
  /** Epoch milliseconds at which the bucket is full again, for `X-RateLimit-Reset`. */
  readonly resetAt: number;
  /**
   * Whole seconds the client should wait before retrying, for `Retry-After`.
   * `0` when the request was allowed. Always at least 1 when refused, because
   * `Retry-After: 0` invites an immediate retry that would also be refused.
   */
  readonly retryAfterSeconds: number;
};

export type RateLimitOptions = {
  /** Sustained requests per window. */
  readonly limit?: number;
  readonly windowMs?: number;
  /** Injected clock in epoch milliseconds; defaults to `Date.now`. */
  readonly now?: () => number;
  /** Tokens this request costs. Defaults to 1. */
  readonly cost?: number;
};

type Bucket = {
  /** Fractional tokens available. */
  tokens: number;
  lastRefillAt: number;
  limit: number;
  windowMs: number;
};

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly defaultLimit: number;
  private readonly defaultWindowMs: number;
  private readonly clock: () => number;

  constructor(
    options: {
      readonly limit?: number;
      readonly windowMs?: number;
      readonly now?: () => number;
    } = {},
  ) {
    this.defaultLimit = options.limit ?? DEFAULT_RATE_LIMIT;
    this.defaultWindowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.clock = options.now ?? (() => Date.now());
  }

  /**
   * Consumes `cost` tokens for `key`.
   *
   * A bucket starts full, so a client's first request is never refused. The refill
   * rate is `limit / windowMs` tokens per millisecond, applied lazily on each
   * consumption — there is no timer to leak.
   */
  consume(key: string, options: RateLimitOptions = {}): RateLimitDecision {
    const limit = normalisePositiveInt(options.limit ?? this.defaultLimit, this.defaultLimit);
    const windowMs = normalisePositiveInt(
      options.windowMs ?? this.defaultWindowMs,
      this.defaultWindowMs,
    );
    const cost = Math.max(1, Math.floor(options.cost ?? 1));
    const now = (options.now ?? this.clock)();

    let bucket = this.buckets.get(key);
    if (
      !bucket ||
      // A reconfigured limit resets the bucket rather than reinterpreting the
      // tokens already in it against a different capacity.
      bucket.limit !== limit ||
      bucket.windowMs !== windowMs
    ) {
      bucket = { tokens: limit, lastRefillAt: now, limit, windowMs };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = Math.max(0, now - bucket.lastRefillAt);
      if (elapsed > 0) {
        bucket.tokens = Math.min(limit, bucket.tokens + (elapsed * limit) / windowMs);
        bucket.lastRefillAt = now;
      }
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return {
        allowed: true,
        limit,
        remaining: Math.floor(bucket.tokens),
        resetAt: Math.ceil(now + ((limit - bucket.tokens) * windowMs) / limit),
        retryAfterSeconds: 0,
      };
    }

    // Time until enough tokens have accrued to satisfy *this* request, not until
    // the bucket is full — a client asking for one token should not be told to
    // wait for a full window.
    const deficit = cost - bucket.tokens;
    const waitMs = (deficit * windowMs) / limit;
    return {
      allowed: false,
      limit,
      remaining: Math.floor(bucket.tokens),
      resetAt: Math.ceil(now + waitMs),
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }

  /** Current whole tokens for `key` without consuming any. */
  peek(key: string, now: number = this.clock()): number | null {
    const bucket = this.buckets.get(key);
    if (!bucket) return null;
    const elapsed = Math.max(0, now - bucket.lastRefillAt);
    return Math.floor(
      Math.min(bucket.limit, bucket.tokens + (elapsed * bucket.limit) / bucket.windowMs),
    );
  }

  /** Drops one key's bucket, or every bucket when no key is given. */
  reset(key?: string): void {
    if (key === undefined) {
      this.buckets.clear();
      return;
    }
    this.buckets.delete(key);
  }

  /** Number of tracked keys, for the diagnostics endpoint. */
  get size(): number {
    return this.buckets.size;
  }
}

function normalisePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

/**
 * The gateway's shared limiter.
 *
 * Module-level so every route handler in the process shares one set of buckets;
 * a per-request limiter would never refuse anything.
 */
export const apiRateLimiter = new RateLimiter();

/**
 * Rate limit that applies to one API key, resolved in a fixed precedence:
 *
 *   1. the `rate:unlimited` scope — an operator-granted exemption,
 *   2. `APIKey.rateLimit` — the per-key quota,
 *   3. `API_RATE_LIMIT_PER_MINUTE` — the deployment-wide default,
 *   4. `DEFAULT_RATE_LIMIT` (60).
 *
 * The scope wins over the column so revoking an exemption is one scope edit rather
 * than a hunt for whichever number is larger, and the column wins over the
 * environment so a batch integration can be given headroom without raising the
 * ceiling for every key in the deployment.
 *
 * A non-positive or non-finite per-key value is ignored rather than honoured: a
 * stored `0` would lock the key out completely, which is what `isActive = false`
 * is for.
 */
export function rateLimitForKey(
  scopes: readonly string[],
  options: {
    /** `APIKey.rateLimit`; `null`/`undefined` falls through to the environment. */
    readonly keyLimit?: number | null;
    readonly env?: { readonly API_RATE_LIMIT_PER_MINUTE?: string | undefined };
  } = {},
): number {
  if (scopes.includes("rate:unlimited")) return Number.MAX_SAFE_INTEGER;

  const keyLimit = options.keyLimit;
  if (typeof keyLimit === "number" && Number.isFinite(keyLimit) && keyLimit > 0) {
    return Math.floor(keyLimit);
  }

  const env =
    options.env ??
    (process.env as { readonly API_RATE_LIMIT_PER_MINUTE?: string | undefined });
  const configured = Number(env.API_RATE_LIMIT_PER_MINUTE);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_RATE_LIMIT;
}

/** The `X-RateLimit-*` headers for a decision. */
export function rateLimitHeaders(
  decision: RateLimitDecision,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(Math.max(0, decision.remaining)),
    "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
  };
  if (!decision.allowed) {
    headers["Retry-After"] = String(decision.retryAfterSeconds);
  }
  return headers;
}
