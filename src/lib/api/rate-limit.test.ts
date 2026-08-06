import { describe, expect, it } from "vitest";

import {
  DEFAULT_RATE_LIMIT,
  DEFAULT_WINDOW_MS,
  RateLimiter,
  rateLimitForKey,
  rateLimitHeaders,
} from "./rate-limit";

/** A limiter driven by a clock the test advances by hand. */
function fixedClock(startAt = 1_700_000_000_000) {
  let current = startAt;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
    get current() {
      return current;
    },
  };
}

describe("RateLimiter", () => {
  it("allows exactly `limit` requests before refusing", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 5, windowMs: 1_000, now: clock.now });

    for (let index = 0; index < 5; index += 1) {
      const decision = limiter.consume("key-1");
      expect(decision.allowed).toBe(true);
      expect(decision.limit).toBe(5);
      expect(decision.remaining).toBe(4 - index);
    }

    const refused = limiter.consume("key-1");
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
  });

  it("starts each bucket full, so a first request is never refused", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });

    expect(limiter.consume("fresh").allowed).toBe(true);
  });

  it("reports a Retry-After of at least one second when it refuses", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 100, windowMs: 1_000, now: clock.now });

    for (let index = 0; index < 100; index += 1) limiter.consume("key-1");
    const refused = limiter.consume("key-1");

    expect(refused.allowed).toBe(false);
    // One token accrues in 10 ms here, which rounds to 0 s; `Retry-After: 0`
    // would invite an immediate retry that would also be refused.
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("refills continuously and admits a request once one token has accrued", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 10, windowMs: 1_000, now: clock.now });

    for (let index = 0; index < 10; index += 1) limiter.consume("key-1");
    expect(limiter.consume("key-1").allowed).toBe(false);

    // 100 ms is exactly one token at 10 per second.
    clock.advance(100);
    expect(limiter.consume("key-1").allowed).toBe(true);
    expect(limiter.consume("key-1").allowed).toBe(false);
  });

  it("refills to the full limit after a whole window and no further", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 4, windowMs: 1_000, now: clock.now });

    for (let index = 0; index < 4; index += 1) limiter.consume("key-1");
    clock.advance(10_000);

    // Ten windows of idling must not bank forty tokens: the burst is capped at
    // the bucket capacity.
    expect(limiter.peek("key-1")).toBe(4);
    for (let index = 0; index < 4; index += 1) {
      expect(limiter.consume("key-1").allowed).toBe(true);
    }
    expect(limiter.consume("key-1").allowed).toBe(false);
  });

  it("does not allow a burst of 2× the limit across a window boundary", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 10, windowMs: 1_000, now: clock.now });

    // Spend the whole quota at the very end of a notional window...
    for (let index = 0; index < 10; index += 1) limiter.consume("key-1");
    clock.advance(1);

    // ...and immediately after the boundary a fixed window would grant ten more.
    let allowed = 0;
    for (let index = 0; index < 10; index += 1) {
      if (limiter.consume("key-1").allowed) allowed += 1;
    }
    expect(allowed).toBe(0);
  });

  it("keeps buckets independent per key", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 2, windowMs: 1_000, now: clock.now });

    limiter.consume("a");
    limiter.consume("a");
    expect(limiter.consume("a").allowed).toBe(false);
    // One noisy client must not consume another's quota.
    expect(limiter.consume("b").allowed).toBe(true);
  });

  it("charges a multi-token request against the same bucket", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 10, windowMs: 1_000, now: clock.now });

    const heavy = limiter.consume("key-1", { cost: 10 });
    expect(heavy.allowed).toBe(true);
    expect(heavy.remaining).toBe(0);
    expect(limiter.consume("key-1").allowed).toBe(false);
  });

  it("refuses a request costing more than the whole bucket without draining it", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 5, windowMs: 1_000, now: clock.now });

    expect(limiter.consume("key-1", { cost: 6 }).allowed).toBe(false);
    // A refused request must not consume tokens.
    expect(limiter.peek("key-1")).toBe(5);
  });

  it("resets a bucket when the configured limit changes", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 2, windowMs: 1_000, now: clock.now });

    limiter.consume("key-1");
    limiter.consume("key-1");
    expect(limiter.consume("key-1").allowed).toBe(false);

    // Reinterpreting leftover tokens against a different capacity would be wrong,
    // so the bucket is rebuilt at the new limit.
    expect(limiter.consume("key-1", { limit: 5 }).allowed).toBe(true);
    expect(limiter.peek("key-1")).toBe(4);
  });

  it("falls back to the default limit for a nonsensical configured value", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ now: clock.now });

    const decision = limiter.consume("key-1", { limit: 0 });
    expect(decision.limit).toBe(DEFAULT_RATE_LIMIT);
  });

  it("uses the documented defaults when constructed with no options", () => {
    const limiter = new RateLimiter();
    const decision = limiter.consume("key-1");
    expect(decision.limit).toBe(DEFAULT_RATE_LIMIT);
    expect(DEFAULT_WINDOW_MS).toBe(60_000);
  });

  it("reports and clears its tracked keys", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ now: clock.now });

    limiter.consume("a");
    limiter.consume("b");
    expect(limiter.size).toBe(2);

    limiter.reset("a");
    expect(limiter.size).toBe(1);
    expect(limiter.peek("a")).toBeNull();

    limiter.reset();
    expect(limiter.size).toBe(0);
  });
});

describe("rateLimitForKey", () => {
  it("uses the documented default when nothing is configured", () => {
    expect(rateLimitForKey([], undefined, {})).toBe(DEFAULT_RATE_LIMIT);
  });

  it("honours API_RATE_LIMIT_PER_MINUTE", () => {
    expect(rateLimitForKey([], undefined, { API_RATE_LIMIT_PER_MINUTE: "600" })).toBe(600);
  });

  it("ignores a non-numeric or non-positive override", () => {
    expect(rateLimitForKey([], undefined, { API_RATE_LIMIT_PER_MINUTE: "abc" })).toBe(
      DEFAULT_RATE_LIMIT,
    );
    expect(rateLimitForKey([], undefined, { API_RATE_LIMIT_PER_MINUTE: "-5" })).toBe(
      DEFAULT_RATE_LIMIT,
    );
  });

  it("exempts a key carrying the rate:unlimited scope, even with a per-key limit set", () => {
    expect(
      rateLimitForKey(["rate:unlimited"], 10, { API_RATE_LIMIT_PER_MINUTE: "1" }),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("prefers a finite, positive per-key limit over the global default", () => {
    expect(rateLimitForKey([], 240, { API_RATE_LIMIT_PER_MINUTE: "600" })).toBe(240);
  });

  it("falls back to the global default when the per-key limit is null, absent, or invalid", () => {
    expect(rateLimitForKey([], null, { API_RATE_LIMIT_PER_MINUTE: "600" })).toBe(600);
    expect(rateLimitForKey([], undefined, { API_RATE_LIMIT_PER_MINUTE: "600" })).toBe(600);
    expect(rateLimitForKey([], 0, { API_RATE_LIMIT_PER_MINUTE: "600" })).toBe(600);
    expect(rateLimitForKey([], -5, { API_RATE_LIMIT_PER_MINUTE: "600" })).toBe(600);
  });
});

describe("rateLimitHeaders", () => {
  it("emits the three X-RateLimit headers for an allowed request", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 10, windowMs: 60_000, now: clock.now });
    const headers = rateLimitHeaders(limiter.consume("key-1"));

    expect(headers["X-RateLimit-Limit"]).toBe("10");
    expect(headers["X-RateLimit-Remaining"]).toBe("9");
    // Reset is expressed in whole epoch seconds, as the convention expects.
    expect(Number(headers["X-RateLimit-Reset"])).toBeGreaterThan(1_600_000_000);
    expect(headers).not.toHaveProperty("Retry-After");
  });

  it("adds Retry-After only when the request was refused", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });
    limiter.consume("key-1");
    const headers = rateLimitHeaders(limiter.consume("key-1"));

    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(headers["Retry-After"]).toBe("60");
  });
});
