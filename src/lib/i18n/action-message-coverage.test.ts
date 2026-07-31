/**
 * Action message coverage — every messageKey the action layer can emit has a
 * Korean translation in the MESSAGES table.
 *
 * The contract is: `messages.ts` ERROR_MESSAGES and SUCCESS_MESSAGES each have
 * a `ko` entry for every user-facing key. Without this gate, a new action can
 * be added with only an English fallback and Korean users see English text.
 */

import { describe, expect, it } from "vitest";

import { ERROR_MESSAGES, SUCCESS_MESSAGES, MESSAGES } from "./messages";

describe("action message Korean coverage", () => {
  it("every error message key has a ko entry", () => {
    const missing: string[] = [];
    for (const [key, entry] of Object.entries(ERROR_MESSAGES)) {
      // The idle key is intentionally empty in both languages.
      if (key === "action.idle") continue;
      if (!entry.ko || entry.ko.length === 0) {
        missing.push(key);
      }
    }
    expect(
      missing,
      `Error keys missing Korean: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every success message key has a ko entry", () => {
    const missing: string[] = [];
    for (const [key, entry] of Object.entries(SUCCESS_MESSAGES)) {
      if (!entry.ko || entry.ko.length === 0) {
        missing.push(key);
      }
    }
    expect(
      missing,
      `Success keys missing Korean: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("MESSAGES table is non-empty", () => {
    expect(Object.keys(MESSAGES).length).toBeGreaterThan(20);
  });
});
