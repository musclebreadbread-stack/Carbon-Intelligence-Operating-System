/** @vitest-environment jsdom */

/**
 * Proof that the emission-engine page shows *computed* numbers.
 *
 * The assertion is deliberately end-to-end for the read path: the repository's
 * `getInventory()` (which runs the real orchestrator over the fixture dataset) is
 * compared against `buildInventory()` called directly on the same fixtures, and the
 * strings the component renders are compared against both. If anyone reintroduces a
 * hardcoded array on this page, this test fails.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The repository imports `@/lib/prisma`; in demo mode `withDb` never calls it, but
// the module must not instantiate a real client during the test run.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { buildInventory } from "@/lib/domain/emissions/aggregate";
import { resetDataMode, getDataMode } from "@/lib/data/db";
import {
  DEMO_CURRENT_YEAR,
  DEMO_ORGANIZATION_ID,
} from "@/lib/data/demo";
import {
  demoRawResults,
  getInventory,
  resetDemoCalculationCache,
} from "@/lib/data/repositories/calculation";
import { createFormatter, formatEmissions } from "@/lib/format";

import { ScopeTotals } from "./scope-totals";

describe("emission-engine scope totals", () => {
  beforeEach(() => {
    resetDataMode();
    resetDemoCalculationCache();
  });

  it.each(["ko", "en"] as const)(
    "renders exactly the buildInventory() figures for the fixture dataset (locale=%s)",
    async (locale) => {
      const fmt = createFormatter(locale);
      const expected = buildInventory(demoRawResults(DEMO_CURRENT_YEAR));
      const inventory = await getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);

      // The read went through the demo fallback, i.e. the engines, not a database.
      expect(getDataMode()).toBe("demo");

      // The repository's own totals must equal the engine's, or the page would be
      // showing a different arithmetic from the one under test.
      expect(inventory.totals.scope1Total).toBeCloseTo(expected.scope1Total, 6);
      expect(inventory.totals.scope2Location).toBeCloseTo(expected.scope2Location, 6);
      expect(inventory.totals.scope2Market).toBeCloseTo(expected.scope2Market, 6);
      expect(inventory.totals.scope3Total).toBeCloseTo(expected.scope3Total, 6);
      expect(inventory.totals.totalEmissions).toBeCloseTo(expected.totalEmissions, 6);

      // Verify the formatter produces the same string as the default formatEmissions
      if (locale === "ko") {
        expect(fmt.emissions(expected.scope1Total)).toBe(formatEmissions(expected.scope1Total));
      }

      render(<ScopeTotals totals={inventory.totals} consolidated={inventory.consolidated} />);

      expect(screen.getByTestId("scope-value-scope1").textContent).toBe(
        formatEmissions(expected.scope1Total),
      );
      expect(screen.getByTestId("scope-value-scope2Location").textContent).toBe(
        formatEmissions(expected.scope2Location),
      );
      expect(screen.getByTestId("scope-value-scope2Market").textContent).toBe(
        formatEmissions(expected.scope2Market),
      );
      expect(screen.getByTestId("scope-value-scope3").textContent).toBe(
        formatEmissions(expected.scope3Total),
      );
      expect(screen.getByTestId("scope-value-total").textContent).toBe(
        formatEmissions(expected.totalEmissions),
      );
      expect(screen.getByTestId("scope-value-biogenic").textContent).toBe(
        formatEmissions(expected.biogenicCO2),
      );
    },
  );

  it("renders one row per reported Scope 3 category", async () => {
    const expected = buildInventory(demoRawResults(DEMO_CURRENT_YEAR));
    const inventory = await getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);

    render(<ScopeTotals totals={inventory.totals} />);

    const rows = screen.getByTestId("scope3-categories").querySelectorAll("li");
    expect(rows.length).toBe(Object.keys(expected.scope3ByCategory).length);
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });

  it("states which Scope 2 basis feeds the total", async () => {
    const inventory = await getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);
    render(<ScopeTotals totals={inventory.totals} />);
    expect(screen.getByText(/Total \(Scope 2 location basis\)/)).toBeTruthy();
  });
});
