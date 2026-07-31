/** @vitest-environment jsdom */

/**
 * Auth-page behaviour with no Supabase project configured.
 *
 * `NEXT_PUBLIC_*` variables are inlined at build time in a real build, but under
 * Vitest they are read from `process.env` at call time, so the unconfigured case is
 * the default here and the configured case is set explicitly.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();
const getSession = vi.fn(async () => ({ data: { session: null } }));

vi.mock("@/lib/supabase/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/client")>(
    "@/lib/supabase/client",
  );
  return {
    ...actual,
    createClient: () => ({
      auth: {
        signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
        resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmail(...args),
        signInWithOAuth: vi.fn(),
        getSession: () => getSession(),
        updateUser: vi.fn(),
        resend: vi.fn(),
      },
    }),
  };
});

/** Search params the login page's `CallbackError` notice reads. */
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

import ForgotPasswordPage from "./forgot-password/page";
import LoginPage from "./login/page";
import ResetPasswordPage from "./reset-password/page";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
});

describe("isSupabaseConfigured", () => {
  it("rejects absent, placeholder and non-URL values", () => {
    expect(isSupabaseConfigured(undefined, undefined)).toBe(false);
    expect(isSupabaseConfigured("https://placeholder.supabase.co", "anon-key")).toBe(false);
    expect(isSupabaseConfigured("https://abc.supabase.co", "placeholder")).toBe(false);
    expect(isSupabaseConfigured("not-a-url", "anon-key")).toBe(false);
    expect(isSupabaseConfigured("https://abc.supabase.co", "eyJhbGciOi")).toBe(true);
  });
});

describe("login page", () => {
  it("renders the Korean unconfigured-Supabase notice instead of failing on submit", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    expect(screen.getByTestId("supabase-not-configured")).toBeTruthy();
    expect(screen.getByText("Supabase가 구성되지 않았습니다")).toBeTruthy();

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    // The page refuses locally with an explanation; no network call is attempted.
    expect(signInWithPassword).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole("alert").map((node) => node.textContent ?? "");
    expect(alerts.some((text) => text.includes("Supabase가 구성되지 않아"))).toBe(true);
  });

  it("links the forgot-password page rather than a dead anchor", () => {
    render(<LoginPage />);
    const link = screen.getByRole("link", { name: "Forgot password?" });
    expect(link.getAttribute("href")).toBe("/forgot-password");
  });

  it("offers the demo dashboard as the way forward", () => {
    render(<LoginPage />);
    expect(
      screen
        .getByRole("link", { name: "Continue to the demo dashboard" })
        .getAttribute("href"),
    ).toBe("/dashboard");
  });
});

describe("forgot-password page", () => {
  it("validates the email format before calling Supabase", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Enter a valid email address")).toBeTruthy();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("sends the reset email when Supabase is configured and the address is valid", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiJ9";
    resetPasswordForEmail.mockResolvedValue({ error: null });

    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    expect(screen.queryByTestId("supabase-not-configured")).toBeNull();
    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByTestId("reset-email-sent")).toBeTruthy();
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(resetPasswordForEmail.mock.calls[0][0]).toBe("someone@example.com");
  });
});

describe("reset-password page", () => {
  it("shows the unconfigured notice and no recovery-session error at once", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByTestId("supabase-not-configured")).toBeTruthy();
    expect(screen.queryByTestId("no-recovery-session")).toBeNull();
  });

  it("requires a minimum password length and a matching confirmation", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(await screen.findByText("Use at least 8 characters")).toBeTruthy();

    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), "longenoughpassword");
    await user.type(screen.getByLabelText("Confirm new password"), "different-password");
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(await screen.findByText("The two passwords do not match")).toBeTruthy();
  });
});
