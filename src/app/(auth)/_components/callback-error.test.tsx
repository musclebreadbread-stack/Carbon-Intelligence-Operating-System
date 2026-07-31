/** @vitest-environment jsdom */

/**
 * OAuth / email-link callback error notice.
 *
 * `/auth/callback` used to redirect every failure to `/login` with nothing attached, so
 * the user learned nothing. These tests pin that each stable code produces text the user
 * can act on, that an unknown code still says *something* rather than falling back to
 * silence, and that no code renders nothing at all.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const searchParams = { get: vi.fn<(key: string) => string | null>() };

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

import { CallbackError, callbackErrorMessage } from "./callback-error";

describe("callbackErrorMessage", () => {
  it("returns null when there is no error to report", () => {
    expect(callbackErrorMessage(null)).toBeNull();
    expect(callbackErrorMessage("")).toBeNull();
  });

  it("explains each code the callback can emit", () => {
    for (const code of [
      "provider_error",
      "missing_code",
      "exchange_failed",
      "supabase_unconfigured",
    ]) {
      const message = callbackErrorMessage(code);
      expect(message).not.toBeNull();
      expect((message ?? "").length).toBeGreaterThan(20);
    }
  });

  it("names the variables to set when no identity provider is configured", () => {
    expect(callbackErrorMessage("supabase_unconfigured")).toContain(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("says something for an unrecognised code rather than nothing", () => {
    // Silence is the bug this component exists to fix, so an unknown code must not
    // reintroduce it.
    expect(callbackErrorMessage("something_new")).not.toBeNull();
  });

  it("gives distinct explanations for distinct causes", () => {
    const messages = [
      "provider_error",
      "missing_code",
      "exchange_failed",
      "supabase_unconfigured",
    ].map((code) => callbackErrorMessage(code));
    expect(new Set(messages).size).toBe(messages.length);
  });
});

describe("CallbackError", () => {
  it("renders nothing when the URL carries no error", () => {
    searchParams.get.mockReturnValue(null);

    render(<CallbackError />);

    expect(screen.queryByTestId("callback-error")).toBeNull();
  });

  it("renders the explanation as an alert when it does", () => {
    searchParams.get.mockReturnValue("exchange_failed");

    render(<CallbackError />);

    const alert = screen.getByTestId("callback-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("expired");
  });

  it("does not render the raw code", () => {
    searchParams.get.mockReturnValue("exchange_failed");

    render(<CallbackError />);

    expect(screen.getByTestId("callback-error").textContent).not.toContain("exchange_failed");
  });
});
