import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

import { UnauthorizedError } from "@/lib/core/errors";
import { DEMO_ADMIN_USER_ID, DEMO_ORGANIZATION_ID } from "@/lib/data/demo";
import { resetDataMode } from "@/lib/data/db";

import { can, isAdministrator } from "./rbac";
import {
  getActiveOrganizationId,
  getAuthStatus,
  getDemoSession,
  getSession,
  isSupabaseConfigured,
  requireSession,
  sessionFromApiKey,
} from "./session";

const ORIGINAL = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  db: process.env.DATABASE_URL,
};

/** Forces the data layer into demo mode so the fixtures back the session. */
function useDemoData(): void {
  delete process.env.DATABASE_URL;
  resetDataMode();
}

function unconfigureSupabase(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "placeholder-anon-key";
}

function configureSupabase(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real";
}

beforeEach(() => {
  vi.clearAllMocks();
  useDemoData();
  unconfigureSupabase();
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

describe("isSupabaseConfigured", () => {
  it("accepts a real project URL and key", () => {
    expect(
      isSupabaseConfigured("https://abcdefgh.supabase.co", "eyJhbGciOiJIUzI1NiJ9.real"),
    ).toBe(true);
  });

  it("rejects the placeholder key that ships in .env.local", () => {
    expect(isSupabaseConfigured("http://localhost:54321", "placeholder-anon-key")).toBe(false);
  });

  it("rejects a missing URL or key", () => {
    expect(isSupabaseConfigured("", "key")).toBe(false);
    expect(isSupabaseConfigured("https://x.supabase.co", "")).toBe(false);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("rejects a non-http URL", () => {
    expect(isSupabaseConfigured("not-a-url", "eyJreal")).toBe(false);
  });
});

describe("getSession with Supabase unconfigured", () => {
  it("returns the offline demo session so the app is navigable", async () => {
    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session?.source).toBe("demo");
    expect(session?.userId).toBe(DEMO_ADMIN_USER_ID);
    expect(session?.organizationId).toBe(DEMO_ORGANIZATION_ID);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("carries the fixture roles, so authorisation is real even offline", async () => {
    const session = await getDemoSession();
    expect(session.roles.length).toBeGreaterThan(0);
    expect(isAdministrator(session)).toBe(true);
    expect(can(session, "activity_data", "create")).toBe(true);
  });

  it("loads the ABAC policies alongside the roles", async () => {
    const session = await getDemoSession();
    expect(session.accessPolicies.length).toBeGreaterThan(0);
    // The cross-tenant deny policy is always present.
    expect(can(session, "activity_data", "read", { organizationId: "someone-else" })).toBe(false);
  });
});

describe("getSession with Supabase configured", () => {
  it("returns null when nobody is signed in", async () => {
    configureSupabase();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns null when Supabase reports an error", async () => {
    configureSupabase();
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns null for an identity with no matching User row", async () => {
    configureSupabase();
    getUser.mockResolvedValue({
      data: { user: { email: "stranger@example.com" } },
      error: null,
    });
    await expect(getSession()).resolves.toBeNull();
  });

  it("resolves the tenant user by email, case-insensitively", async () => {
    configureSupabase();
    getUser.mockResolvedValue({
      data: { user: { email: "ANALYST@example.com" } },
      error: null,
    });
    const session = await getSession();
    expect(session?.source).toBe("supabase");
    expect(session?.email).toBe("analyst@example.com");
    expect(session?.roles.map((role) => role.id)).toEqual(["demo-role-data-analyst"]);
    // The analyst may enter data but may not approve a calculation.
    expect(can(session!, "activity_data", "create")).toBe(true);
    expect(can(session!, "calculation", "approve")).toBe(false);
  });
});

describe("requireSession", () => {
  it("returns the session when one exists", async () => {
    await expect(requireSession()).resolves.toMatchObject({ source: "demo" });
  });

  it("throws UnauthorizedError when nobody is signed in", async () => {
    configureSupabase();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireSession()).rejects.toThrow(UnauthorizedError);
    await expect(requireSession()).rejects.toThrow(/Sign in to continue/);
  });
});

describe("getActiveOrganizationId", () => {
  it("returns the session's organisation", async () => {
    await expect(getActiveOrganizationId()).resolves.toBe(DEMO_ORGANIZATION_ID);
  });

  it("falls back to the default organisation with no session", async () => {
    configureSupabase();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getActiveOrganizationId()).resolves.toBe(DEMO_ORGANIZATION_ID);
  });
});

describe("sessionFromApiKey", () => {
  const principal = {
    id: "key-1",
    organizationId: DEMO_ORGANIZATION_ID,
    userId: "demo-user-analyst",
    name: "Ingest key",
    scopes: ["activity_data:read", "activity_data:create"],
    rateLimitPerMinute: null,
    isActive: true,
    expiresAt: null,
  };

  it("builds a session with the key owner's roles and the key's scopes", async () => {
    const session = await sessionFromApiKey(principal);
    expect(session?.source).toBe("apiKey");
    expect(session?.userId).toBe("demo-user-analyst");
    expect(session?.scopes).toEqual(principal.scopes);
    expect(session?.roles.map((role) => role.id)).toEqual(["demo-role-data-analyst"]);
    expect(can(session!, "activity_data", "create")).toBe(true);
    expect(can(session!, "security", "update")).toBe(false);
  });

  it("returns null for an unknown user", async () => {
    await expect(
      sessionFromApiKey({ ...principal, userId: "nobody" }),
    ).resolves.toBeNull();
  });
});

describe("getAuthStatus", () => {
  it("reports the Supabase and data-mode configuration", () => {
    expect(getAuthStatus().supabaseConfigured).toBe(false);
    configureSupabase();
    expect(getAuthStatus().supabaseConfigured).toBe(true);
  });
});
