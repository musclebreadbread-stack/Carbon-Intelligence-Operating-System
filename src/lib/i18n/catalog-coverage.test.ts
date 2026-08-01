/**
 * Dictionary catalog coverage — every key in ko exists in en and vice versa.
 *
 * This is an anti-drift gate: if a developer adds a string to one dictionary
 * without the other, this test fails immediately rather than the gap surfacing
 * later as a blank label in production.
 */

import { describe, expect, it } from "vitest";

import en from "./dictionaries/en";
import ko from "./dictionaries/ko";

describe("catalog coverage", () => {
  const koKeys = new Set(Object.keys(ko));
  const enKeys = new Set(Object.keys(en));

  it("every Korean key has an English counterpart", () => {
    const missing = [...koKeys].filter((k) => !enKeys.has(k));
    expect(missing, `Keys in ko.ts missing from en.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("every English key has a Korean counterpart", () => {
    const missing = [...enKeys].filter((k) => !koKeys.has(k));
    expect(missing, `Keys in en.ts missing from ko.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("no Korean value is empty (except format.na)", () => {
    for (const [key, value] of Object.entries(ko)) {
      if (key === "format.na") continue;
      expect(value.length, `ko["${key}"] is empty`).toBeGreaterThan(0);
    }
  });

  it("no English value is empty (except format.na)", () => {
    for (const [key, value] of Object.entries(en)) {
      if (key === "format.na") continue;
      expect(value.length, `en["${key}"] is empty`).toBeGreaterThan(0);
    }
  });

  it("dictionaries have the same number of keys", () => {
    expect(koKeys.size).toBe(enKeys.size);
    expect(koKeys.size).toBeGreaterThan(50); // Sanity: we have real content
  });
});
