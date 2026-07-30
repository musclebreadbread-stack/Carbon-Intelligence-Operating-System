import { describe, expect, it } from "vitest";

import { CalculationError } from "./errors";
import {
  calendarYear,
  createPeriod,
  fiscalYearBounds,
  monthsInPeriod,
  overlapDays,
  periodDays,
  prorate,
} from "./period";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("createPeriod", () => {
  it("rejects an inverted period", () => {
    expect(() => createPeriod(utc("2024-12-31"), utc("2024-01-01"))).toThrow(
      CalculationError,
    );
  });
});

describe("periodDays", () => {
  it("counts both endpoints", () => {
    expect(periodDays(createPeriod(utc("2024-01-01"), utc("2024-01-01")))).toBe(1);
    expect(periodDays(createPeriod(utc("2024-01-01"), utc("2024-01-31")))).toBe(31);
  });

  it("counts the leap day", () => {
    expect(periodDays(calendarYear(2024))).toBe(366);
    expect(periodDays(calendarYear(2023))).toBe(365);
  });
});

describe("overlapDays", () => {
  it("returns the shared day count", () => {
    const a = createPeriod(utc("2024-01-01"), utc("2024-01-31"));
    const b = createPeriod(utc("2024-01-15"), utc("2024-02-15"));
    expect(overlapDays(a, b)).toBe(17); // 15 Jan – 31 Jan inclusive
    expect(overlapDays(b, a)).toBe(17);
  });

  it("returns 0 for disjoint periods", () => {
    const a = createPeriod(utc("2024-01-01"), utc("2024-01-31"));
    const b = createPeriod(utc("2024-02-01"), utc("2024-02-29"));
    expect(overlapDays(a, b)).toBe(0);
  });
});

describe("prorate", () => {
  it("splits a straddling invoice across reporting years", () => {
    const invoice = createPeriod(utc("2023-12-01"), utc("2024-01-31")); // 62 days
    expect(periodDays(invoice)).toBe(62);
    // 31 of 62 days fall in 2023 → exactly half.
    expect(prorate(6200, invoice, calendarYear(2023))).toBeCloseTo(3100, 10);
    expect(prorate(6200, invoice, calendarYear(2024))).toBeCloseTo(3100, 10);
  });

  it("returns the whole value when fully contained", () => {
    const invoice = createPeriod(utc("2024-03-01"), utc("2024-03-31"));
    expect(prorate(500, invoice, calendarYear(2024))).toBeCloseTo(500, 10);
  });

  it("returns 0 with no overlap", () => {
    const invoice = createPeriod(utc("2022-03-01"), utc("2022-03-31"));
    expect(prorate(500, invoice, calendarYear(2024))).toBe(0);
  });
});

describe("fiscalYearBounds", () => {
  it("defaults to the calendar year", () => {
    const fy = fiscalYearBounds(utc("2024-06-15"));
    expect(fy.label).toBe(2024);
    expect(fy.start.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(fy.end.toISOString()).toBe("2024-12-31T00:00:00.000Z");
  });

  it("handles an April fiscal year start before the boundary", () => {
    const fy = fiscalYearBounds(utc("2024-03-15"), 4);
    expect(fy.label).toBe(2023);
    expect(fy.start.toISOString()).toBe("2023-04-01T00:00:00.000Z");
    expect(fy.end.toISOString()).toBe("2024-03-31T00:00:00.000Z");
  });

  it("handles an April fiscal year start after the boundary", () => {
    const fy = fiscalYearBounds(utc("2024-04-01"), 4);
    expect(fy.label).toBe(2024);
    expect(fy.start.toISOString()).toBe("2024-04-01T00:00:00.000Z");
    expect(fy.end.toISOString()).toBe("2025-03-31T00:00:00.000Z");
  });

  it("rejects an invalid start month", () => {
    expect(() => fiscalYearBounds(utc("2024-01-01"), 13)).toThrow(CalculationError);
    expect(() => fiscalYearBounds(utc("2024-01-01"), 0)).toThrow(CalculationError);
  });
});

describe("monthsInPeriod", () => {
  it("clips the first and last partial months", () => {
    const months = monthsInPeriod(createPeriod(utc("2024-01-15"), utc("2024-03-10")));
    expect(months).toHaveLength(3);
    expect(months[0].start.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    expect(months[0].end.toISOString()).toBe("2024-01-31T00:00:00.000Z");
    expect(months[1].end.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(months[2].end.toISOString()).toBe("2024-03-10T00:00:00.000Z");
  });

  it("returns 12 months for a full year", () => {
    expect(monthsInPeriod(calendarYear(2023))).toHaveLength(12);
  });

  it("returns a single month for a sub-month period", () => {
    expect(monthsInPeriod(createPeriod(utc("2024-05-02"), utc("2024-05-09")))).toHaveLength(1);
  });
});
