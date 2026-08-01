/**
 * Proxy route protection across every deployment-mode combination.
 *
 * The combination that mattered and was untested: a real `DATABASE_URL` with no
 * Supabase project. The proxy skipped protection whenever Supabase was
 * unconfigured and `getSession()` handed out a demo *administrator* regardless of
 * the database mode, while `canWrite()` returned true for a valid `DATABASE_URL`.
 * The net effect was an anonymous administrator write API. Both halves of that are
 * pinned here — the proxy in this file, the session in `src/lib/auth/session.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

import { resetDataMode } from "@/lib/data/db";

import { updateSession } from "./middleware";

const ORIGINAL = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  db: process.env.DATABASE_URL,
};

const REAL_DB = "postgresql://app:s3cret@db.internal:5432/cios";

function configureSupabase(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real";
}

function unconfigureSupabase(): void {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

function request(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "https://app.example.com"));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  getUser.mockResolvedValue({ data: { user: null }, error: null });
});

afterEach(() => {
  for (const [name, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", ORIGINAL.url],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ORIGINAL.key],
    ["DATABASE_URL", ORIGINAL.db],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetDataMode();
});

describe("no Supabase, no database — the zero-config demo", () => {
  beforeEach(() => {
    unconfigureSupabase();
    delete process.env.DATABASE_URL;
  });

  it("lets a protected route render, because the demo is explicitly navigable", async () => {
    const response = await updateSession(request("/dashboard"));
    expect(response.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("lets the health endpoint through", async () => {
    expect((await updateSession(request("/api/v1/health"))).status).toBe(200);
  });
});

describe("no Supabase, real database — a misconfigured deployment", () => {
  beforeEach(() => {
    unconfigureSupabase();
    process.env.DATABASE_URL = REAL_DB;
  });

  it("refuses a protected route instead of admitting an anonymous administrator", async () => {
    const response = await updateSession(request("/dashboard"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "AUTH_NOT_CONFIGURED",
    });
  });

  it("refuses an API route the same way", async () => {
    const response = await updateSession(request("/api/v1/activity-data"));
    expect(response.status).toBe(503);
  });

  it("names both env vars and the demo escape hatch, in English and Korean", async () => {
    const body = (await (await updateSession(request("/dashboard"))).json()) as {
      message: string;
      messageKo: string;
    };
    expect(body.message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(body.message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(body.messageKo).toContain("DATABASE_URL");
  });

  it("still answers health, so the misconfiguration is diagnosable", async () => {
    expect((await updateSession(request("/api/v1/health"))).status).toBe(200);
  });

  it("still serves the public sign-in paths and the landing page", async () => {
    for (const path of ["/", "/login", "/register", "/auth/callback"]) {
      expect((await updateSession(request(path))).status).toBe(200);
    }
  });

  it("treats a placeholder DATABASE_URL as unconfigured, not as a real database", async () => {
    process.env.DATABASE_URL = "postgresql://username:password@localhost:5432/placeholder";
    expect((await updateSession(request("/dashboard"))).status).toBe(200);
  });
});

describe("Supabase configured", () => {
  beforeEach(configureSupabase);

  it("redirects an anonymous request on a protected route to the login page", async () => {
    process.env.DATABASE_URL = REAL_DB;
    const response = await updateSession(request("/dashboard"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("redirects with no database configured too", async () => {
    delete process.env.DATABASE_URL;
    expect((await updateSession(request("/dashboard"))).status).toBe(307);
  });

  it("lets an authenticated request through", async () => {
    process.env.DATABASE_URL = REAL_DB;
    getUser.mockResolvedValue({
      data: { user: { email: "admin@example.com" } },
      error: null,
    });
    expect((await updateSession(request("/dashboard"))).status).toBe(200);
  });

  it("does not redirect a public path", async () => {
    expect((await updateSession(request("/login"))).status).toBe(200);
  });
});
