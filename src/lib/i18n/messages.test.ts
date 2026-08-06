/**
 * `resolveMessage`'s `ko` branch was dead code: the file's own header says the
 * Korean deliverable is "configuration notices" (demo-mode, error, validation
 * copy), but every `ERROR_MESSAGES` key needs a `ko` entry for that promise to
 * hold, and the only call site (`action-error.tsx`) never passed a locale. These
 * cases pin that every error key is translated and that `resolveMessage`
 * actually returns the Korean string when asked.
 */

import { describe, expect, it } from "vitest";

import { ERROR_MESSAGES, koreanMessage, resolveMessage } from "./messages";

const HANGUL = /[가-힣]/;

describe("ERROR_MESSAGES", () => {
  it("carries a Korean translation for every key except the neutral idle state", () => {
    const untranslated = Object.entries(ERROR_MESSAGES)
      .filter(([key]) => key !== "action.idle")
      .filter(([, entry]) => !entry.ko || !HANGUL.test(entry.ko))
      .map(([key]) => key);
    expect(untranslated).toEqual([]);
  });
});

describe("resolveMessage", () => {
  it("returns the Korean string when locale is ko and one is authored", () => {
    expect(resolveMessage("action.error.NOT_FOUND", "fallback", "ko")).toBe(
      ERROR_MESSAGES["action.error.NOT_FOUND"].ko,
    );
  });

  it("returns the English string when locale is en", () => {
    expect(resolveMessage("action.error.NOT_FOUND", "fallback", "en")).toBe(
      ERROR_MESSAGES["action.error.NOT_FOUND"].en,
    );
  });

  it("defaults to English when no locale is given", () => {
    expect(resolveMessage("action.error.NOT_FOUND", "fallback")).toBe(
      ERROR_MESSAGES["action.error.NOT_FOUND"].en,
    );
  });

  it("falls back to the caller's message for an unknown key", () => {
    expect(resolveMessage("action.success.somethingNew", "Fallback text", "ko")).toBe(
      "Fallback text",
    );
  });

  it("falls back to English when locale is ko but no Korean entry exists", () => {
    // action.idle has an en value and no ko value.
    expect(resolveMessage("action.idle", "fallback", "ko")).toBe("fallback");
  });
});

describe("koreanMessage", () => {
  it("returns the Korean string when authored, or null otherwise", () => {
    expect(koreanMessage("action.error.NOT_FOUND")).toBe(
      ERROR_MESSAGES["action.error.NOT_FOUND"].ko,
    );
    expect(koreanMessage("action.success.somethingNew")).toBeNull();
    expect(koreanMessage(undefined)).toBeNull();
  });
});
