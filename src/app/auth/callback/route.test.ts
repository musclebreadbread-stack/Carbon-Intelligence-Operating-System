/**
 * Supabase OAuth / email-link callback.
 *
 * Found during the uncatalogued sweep: every failure path redirected to `/login` with no
 * information whatsoever, so a user whose consent was declined, whose link had expired,
 * or who hit a deployment with no Supabase project configured was bounced back to the
 * sign-in form with nothing to act on. The route's own comment claimed to redirect "with
 * error info" and did not. It also had no test coverage at all.
 *
 * Two properties are pinned: every path ends in a redirect carrying a stable reason code,
 * and the `next` parameter cannot be used to turn the callback into an open redirect.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const createServerClient = vi.fn(() => ({
  auth: { exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args) },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...(args as [])),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

import { GET } from "./route";

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function configureSupabase() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-value";
}

async function callback(query: string): Promise<URL> {
  const response = await GET(new Request(`https://app.example.com/auth/callback${query}`));
  expect(response.status).toBe(307);
  return new URL(response.headers.get("location") ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  configureSupabase();
  exchangeCodeForSession.mockResolvedValue({ error: null });
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe("GET /auth/callback on success", () => {
  it("exchanges the code and redirects to the dashboard", async () => {
    const location = await callback("?code=abc123");

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(location.pathname).toBe("/dashboard");
    expect(location.searchParams.get("error")).toBeNull();
  });

  it("honours a same-site next path", async () => {
    const location = await callback("?code=abc123&next=%2Fverification");

    expect(location.pathname).toBe("/verification");
  });
});

describe("GET /auth/callback failure reporting", () => {
  it("reports a provider refusal instead of a silent bounce", async () => {
    const location = await callback("?error=access_denied");

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("provider_error");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("reports a missing code", async () => {
    const location = await callback("");

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("missing_code");
  });

  it("reports an empty code", async () => {
    const location = await callback("?code=");

    expect(location.searchParams.get("error")).toBe("missing_code");
  });

  it("reports an unconfigured deployment rather than failing obscurely", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const location = await callback("?code=abc123");

    expect(location.searchParams.get("error")).toBe("supabase_unconfigured");
    // No pointless call against an empty project URL.
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("reports a placeholder configuration as unconfigured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";

    const location = await callback("?code=abc123");

    expect(location.searchParams.get("error")).toBe("supabase_unconfigured");
  });

  it("reports a failed exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "code verifier expired" } });

    const location = await callback("?code=abc123");

    expect(location.searchParams.get("error")).toBe("exchange_failed");
  });

  it("never reflects the provider's own message into the URL", async () => {
    // An error string echoed into a redirect is a phishing surface and a way to
    // fingerprint the identity provider's configuration.
    exchangeCodeForSession.mockResolvedValue({
      error: { message: "invalid grant for project abcdef at https://project.supabase.co" },
    });

    const location = await callback("?code=abc123");

    expect(location.toString()).not.toContain("supabase.co");
    expect(location.toString()).not.toContain("invalid grant");
  });

  it("turns an unexpected throw into a redirect, not a 500", async () => {
    // This is the one route a user reaches mid-sign-in; a stack trace is not an answer.
    exchangeCodeForSession.mockRejectedValue(new Error("network unreachable"));

    const location = await callback("?code=abc123");

    expect(location.searchParams.get("error")).toBe("unexpected");
  });

  it("preserves a non-default next across the failure redirect", async () => {
    const location = await callback("?next=%2Fverification");

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/verification");
  });
});

describe("GET /auth/callback open-redirect protection", () => {
  it("refuses a protocol-relative next", async () => {
    const location = await callback("?code=abc123&next=%2F%2Fevil.example");

    expect(location.host).toBe("app.example.com");
    expect(location.pathname).toBe("/dashboard");
  });

  it("refuses an absolute next", async () => {
    const location = await callback("?code=abc123&next=https%3A%2F%2Fevil.example%2Fx");

    expect(location.host).toBe("app.example.com");
    expect(location.pathname).toBe("/dashboard");
  });

  it("refuses a scheme-only next", async () => {
    const location = await callback("?code=abc123&next=javascript%3Aalert(1)");

    expect(location.pathname).toBe("/dashboard");
  });
});
