/**
 * i18n foundation tests.
 *
 * Verifies: default locale is ko, cookie parsing, dictionary key parity,
 * locale resolution from messages.ts (backwards compat), and server locale fallback.
 */

import { describe, expect, it } from "vitest";

import en from "./dictionaries/en";
import ko from "./dictionaries/ko";
import type { DictionaryKey } from "./dictionaries/ko";
import { DEFAULT_LOCALE, LOCALES, parseLocale } from "./locales";
import { getDictionarySync } from "./server";
import { resolveMessage } from "./messages";

describe("locales", () => {
  it("defaults to Korean", () => {
    expect(DEFAULT_LOCALE).toBe("ko");
  });

  it("supports exactly ko and en", () => {
    expect(LOCALES).toEqual(["ko", "en"]);
  });

  it("parses valid locale strings", () => {
    expect(parseLocale("ko")).toBe("ko");
    expect(parseLocale("en")).toBe("en");
  });

  it("falls back to default on invalid input", () => {
    expect(parseLocale(null)).toBe("ko");
    expect(parseLocale(undefined)).toBe("ko");
    expect(parseLocale("fr")).toBe("ko");
    expect(parseLocale("")).toBe("ko");
  });
});

describe("dictionary key parity", () => {
  const koKeys = Object.keys(ko).sort();
  const enKeys = Object.keys(en).sort();

  it("Korean and English have the same keys", () => {
    expect(koKeys).toEqual(enKeys);
  });

  it("no empty values in Korean dictionary", () => {
    for (const [key, value] of Object.entries(ko)) {
      if (key !== "format.na") {
        expect(value.length, `ko["${key}"] is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("no empty values in English dictionary", () => {
    for (const [key, value] of Object.entries(en)) {
      if (key !== "format.na") {
        expect(value.length, `en["${key}"] is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("getDictionarySync", () => {
  it("returns Korean dictionary for ko", () => {
    const dict = getDictionarySync("ko");
    expect(dict["app.title"]).toContain("\uD0C4\uC18C");
  });

  it("returns English dictionary for en", () => {
    const dict = getDictionarySync("en");
    expect(dict["app.title"]).toContain("Carbon");
  });
});

describe("resolveMessage (backwards compat)", () => {
  it("resolves Korean for known key with ko locale", () => {
    const msg = resolveMessage("action.error.DEMO_MODE", "fallback", "ko");
    expect(msg).toContain("\uB370\uC774\uD130\uBCA0\uC774\uC2A4");
  });

  it("resolves English for known key with en locale", () => {
    const msg = resolveMessage("action.error.DEMO_MODE", "fallback", "en");
    expect(msg).toContain("database");
  });

  it("defaults to ko (the default locale) when no locale specified", () => {
    const msg = resolveMessage("action.error.DEMO_MODE", "fallback");
    // DEFAULT_LOCALE is now ko, so ko message should be returned
    expect(msg).toContain("\uB370\uC774\uD130\uBCA0\uC774\uC2A4");
  });

  it("falls back to English when ko not available for a key", () => {
    const msg = resolveMessage("action.error.NOT_FOUND", "fallback", "ko");
    // NOT_FOUND only has en in the messages table; should fall back to en
    expect(msg).toContain("record");
  });

  it("uses fallback for unknown key", () => {
    const msg = resolveMessage("action.error.UNKNOWN_CODE", "my fallback");
    expect(msg).toBe("my fallback");
  });
});

describe("type safety", () => {
  it("dictionary keys are typed - accessing a known key works", () => {
    const key: DictionaryKey = "app.title";
    expect(ko[key]).toBeDefined();
    expect(en[key]).toBeDefined();
  });
});
