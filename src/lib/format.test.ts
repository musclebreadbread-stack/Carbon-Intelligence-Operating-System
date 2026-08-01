/**
 * Format module tests.
 *
 * Verifies locale-scoped formatting (Korean default, English switch) for numbers,
 * emissions, percent, currency, dates, and scope labels.
 */

import { describe, expect, it } from "vitest";

import {
  createFormatter,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatEmissions,
  formatFraction,
  formatMonth,
  formatNumber,
  formatPercent,
  humaniseEnum,
  scopeLabel,
  truncate,
} from "./format";

describe("default locale (ko) formatting", () => {
  const fmt = createFormatter("ko");

  it("formats numbers with Korean locale separators", () => {
    expect(fmt.number(1234567, 0)).toBe("1,234,567");
    expect(fmt.number(1234.56, 2)).toBe("1,234.56");
  });

  it("formats null/undefined/NaN as em-dash", () => {
    expect(fmt.number(null)).toBe("\u2014");
    expect(fmt.number(undefined)).toBe("\u2014");
    expect(fmt.number(NaN)).toBe("\u2014");
    expect(fmt.number(Infinity)).toBe("\u2014");
  });

  it("formats emissions with adaptive decimals", () => {
    expect(fmt.emissions(12345)).toBe("12,345");
    expect(fmt.emissions(42.7)).toBe("42.7");
    expect(fmt.emissions(0.123)).toBe("0.123");
  });

  it("formats percent", () => {
    expect(fmt.percent(42.567, 1)).toBe("42.6%");
  });

  it("formats fraction", () => {
    expect(fmt.fraction(0.42, 1)).toBe("42.0%");
  });

  it("formats KRW currency by default for ko", () => {
    const result = fmt.currency(1000000);
    expect(result).toContain("1,000,000");
  });

  it("formats dates as ISO UTC", () => {
    expect(fmt.date("2024-03-31T00:00:00.000Z")).toBe("2024-03-31");
  });

  it("formats dateTime as ISO UTC", () => {
    expect(fmt.dateTime("2024-03-31T14:05:00.000Z")).toBe("2024-03-31 14:05");
  });

  it("formats month", () => {
    expect(fmt.month("2024-03-15T00:00:00.000Z")).toBe("2024-03");
  });

  it("produces Korean scope labels", () => {
    expect(fmt.scopeLabel("SCOPE_1")).toBe("Scope 1");
    expect(fmt.scopeLabel("SCOPE_2_LOCATION")).toContain("\uC704\uCE58");
    expect(fmt.scopeLabel("SCOPE_2_MARKET")).toContain("\uC2DC\uC7A5");
  });
});

describe("English locale formatting", () => {
  const fmt = createFormatter("en");

  it("formats numbers with en-US separators", () => {
    expect(fmt.number(1234567, 0)).toBe("1,234,567");
  });

  it("formats USD currency by default for en", () => {
    const result = fmt.currency(1000);
    expect(result).toContain("$");
    expect(result).toContain("1,000");
  });

  it("produces English scope labels", () => {
    expect(fmt.scopeLabel("SCOPE_2_LOCATION")).toBe("Scope 2 (location)");
    expect(fmt.scopeLabel("SCOPE_2_MARKET")).toBe("Scope 2 (market)");
  });
});

describe("backwards-compatible top-level functions (default locale)", () => {
  it("formatNumber works", () => {
    expect(formatNumber(1234, 0)).toBe("1,234");
  });

  it("formatEmissions works", () => {
    expect(formatEmissions(12345)).toBe("12,345");
  });

  it("formatPercent works", () => {
    expect(formatPercent(42.5, 1)).toBe("42.5%");
  });

  it("formatFraction works", () => {
    expect(formatFraction(0.5, 0)).toBe("50%");
  });

  it("formatCurrency uses KRW for default ko locale", () => {
    const result = formatCurrency(1000);
    expect(result).toContain("1,000");
  });

  it("formatDate works", () => {
    expect(formatDate("2024-01-15T00:00:00.000Z")).toBe("2024-01-15");
    expect(formatDate(null)).toBe("\u2014");
  });

  it("formatDateTime works", () => {
    expect(formatDateTime("2024-01-15T09:30:00.000Z")).toBe("2024-01-15 09:30");
  });

  it("formatMonth works", () => {
    expect(formatMonth("2024-03-15T00:00:00.000Z")).toBe("2024-03");
  });

  it("humaniseEnum works", () => {
    expect(humaniseEnum("SCOPE_2_LOCATION")).toBe("Scope 2 location");
    expect(humaniseEnum(null)).toBe("\u2014");
  });

  it("scopeLabel works", () => {
    expect(scopeLabel("SCOPE_1")).toBe("Scope 1");
  });

  it("truncate works", () => {
    expect(truncate("short")).toBe("short");
    expect(truncate("a".repeat(50), 10)).toHaveLength(10);
  });
});
