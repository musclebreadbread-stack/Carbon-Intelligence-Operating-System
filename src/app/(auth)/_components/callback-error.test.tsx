/** @vitest-environment jsdom */

/**
 * OAuth / email-link callback error notice.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/providers/locale-provider";

const searchParams = { get: vi.fn<(key: string) => string | null>() };

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

import { CallbackError, callbackErrorMessage } from "./callback-error";

describe("callbackErrorMessage (legacy compat)", () => {
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

describe("CallbackError (locale-aware)", () => {
  it("renders nothing when the URL carries no error", () => {
    searchParams.get.mockReturnValue(null);

    render(
      <LocaleProvider locale="ko">
        <CallbackError />
      </LocaleProvider>,
    );

    expect(screen.queryByTestId("callback-error")).toBeNull();
  });

  it("renders Korean explanation by default", () => {
    searchParams.get.mockReturnValue("exchange_failed");

    render(
      <LocaleProvider locale="ko">
        <CallbackError />
      </LocaleProvider>,
    );

    const alert = screen.getByTestId("callback-error");
    expect(alert.getAttribute("role")).toBe("alert");
    // Korean text for exchange_failed
    expect(alert.textContent).toContain("\uB9CC\uB8CC");
  });

  it("renders English explanation when locale is en", () => {
    searchParams.get.mockReturnValue("exchange_failed");

    render(
      <LocaleProvider locale="en">
        <CallbackError />
      </LocaleProvider>,
    );

    const alert = screen.getByTestId("callback-error");
    expect(alert.textContent).toContain("expired");
  });

  it("does not render the raw code", () => {
    searchParams.get.mockReturnValue("exchange_failed");

    render(
      <LocaleProvider locale="ko">
        <CallbackError />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("callback-error").textContent).not.toContain("exchange_failed");
  });
});
