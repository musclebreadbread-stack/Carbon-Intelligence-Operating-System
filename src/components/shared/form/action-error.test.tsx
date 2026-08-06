/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { actionError, actionSuccess } from "@/lib/actions/types";

import { LocaleProvider } from "@/components/providers/locale-provider";

import { ActionError } from "./action-error";

describe("ActionError — locale", () => {
  it("renders the Korean message by default, with no provider (ko is the app default)", () => {
    const state = actionError("NOT_FOUND", "fallback", "action.error.NOT_FOUND");
    render(<ActionError state={state} />);
    expect(
      screen.getByText("해당 레코드가 존재하지 않습니다. 페이지를 새로고침한 후 다시 시도하세요."),
    ).toBeTruthy();
  });

  it("renders the English message when the locale provider is set to en", () => {
    const state = actionError("NOT_FOUND", "fallback", "action.error.NOT_FOUND");
    render(
      <LocaleProvider locale="en">
        <ActionError state={state} />
      </LocaleProvider>,
    );
    expect(
      screen.getByText("That record no longer exists. Reload the page and try again."),
    ).toBeTruthy();
  });

  it("renders the Korean success message, now that every success key carries one", () => {
    const state = actionSuccess({ id: "x" }, "Signed out.", "action.success.signOut");
    render(
      <LocaleProvider locale="ko">
        <ActionError state={state} />
      </LocaleProvider>,
    );
    expect(screen.getByText("로그아웃되었습니다.")).toBeTruthy();
  });

  it("translates the validation error banner too, not just NOT_FOUND", () => {
    const state = actionError(
      "VALIDATION_ERROR",
      "Some values need attention before this can be saved.",
      "action.error.validation",
    );
    render(
      <LocaleProvider locale="ko">
        <ActionError state={state} />
      </LocaleProvider>,
    );
    expect(screen.getByText("저장하기 전에 확인이 필요한 값이 있습니다.")).toBeTruthy();
  });

  it("translates the DEMO_MODE banner's chrome (title, not just the message body)", () => {
    const state = actionError("DEMO_MODE", "No database configured.", "action.error.DEMO_MODE");
    render(
      <LocaleProvider locale="ko">
        <ActionError state={state} />
      </LocaleProvider>,
    );
    expect(screen.getByText("저장되지 않음 — 데이터베이스가 구성되지 않았습니다")).toBeTruthy();
  });

  it("translates the UNAUTHORIZED banner's chrome in English when switched", () => {
    const state = actionError("UNAUTHORIZED", "Session expired.", "action.error.UNAUTHORIZED");
    render(
      <LocaleProvider locale="en">
        <ActionError state={state} />
      </LocaleProvider>,
    );
    expect(screen.getByText("Your session has ended")).toBeTruthy();
    expect(screen.getByText("Sign in again")).toBeTruthy();
  });
});
