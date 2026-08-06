/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { actionError, actionSuccess } from "@/lib/actions/types";

import { LocaleProvider } from "@/components/shared/locale-provider";

import { ActionError } from "./action-error";

describe("ActionError — locale", () => {
  it("renders the English message by default, with no provider", () => {
    const state = actionError("NOT_FOUND", "fallback", "action.error.NOT_FOUND");
    render(<ActionError state={state} />);
    expect(screen.getByText("That record no longer exists. Reload the page and try again.")).toBeTruthy();
  });

  it("renders the Korean message when the locale provider is set to ko", () => {
    const state = actionError("NOT_FOUND", "fallback", "action.error.NOT_FOUND");
    render(
      <LocaleProvider initialLocale="ko">
        <ActionError state={state} />
      </LocaleProvider>,
    );
    expect(
      screen.getByText("해당 레코드가 더 이상 존재하지 않습니다. 페이지를 새로고침한 후 다시 시도하세요."),
    ).toBeTruthy();
  });

  it("renders the Korean success message when a messageKey is authored", () => {
    const state = actionSuccess({ id: "x" }, "Signed out.", "action.success.signOut");
    render(
      <LocaleProvider initialLocale="ko">
        <ActionError state={state} />
      </LocaleProvider>,
    );
    // signOut has no authored ko entry, so it falls back to the English message.
    expect(screen.getByText("Signed out.")).toBeTruthy();
  });

  it("translates the validation error banner too, not just NOT_FOUND", () => {
    const state = actionError(
      "VALIDATION_ERROR",
      "Some values need attention before this can be saved.",
      "action.error.validation",
    );
    render(
      <LocaleProvider initialLocale="ko">
        <ActionError state={state} />
      </LocaleProvider>,
    );
    expect(screen.getByText("저장하기 전에 확인이 필요한 값이 있습니다.")).toBeTruthy();
  });
});
