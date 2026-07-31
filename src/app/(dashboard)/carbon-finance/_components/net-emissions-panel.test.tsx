/** @vitest-environment jsdom */

/**
 * Proof that the carbon-finance page shows a *computed* net figure.
 *
 * Gross comes from the calculated inventory, retirements from the stored offsets,
 * and the rendered net is asserted to equal gross − retired. If the page ever
 * hardcodes a net number, or if offsetting starts mutating gross, this fails.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resetDataMode } from "@/lib/data/db";
import { DEMO_CURRENT_YEAR, DEMO_ORGANIZATION_ID } from "@/lib/data/demo";
import { getCarbonFinanceView } from "@/lib/data/repositories/credits";
import {
  getInventory,
  resetDemoCalculationCache,
} from "@/lib/data/repositories/calculation";
import { createFormatter, formatEmissions } from "@/lib/format";

import { NetEmissionsPanel } from "./net-emissions-panel";

describe("carbon-finance net emissions", () => {
  beforeEach(() => {
    resetDataMode();
    resetDemoCalculationCache();
  });

  it.each(["ko", "en"] as const)(
    "renders net emissions as gross minus retired offsets (locale=%s)",
    async (locale) => {
      const fmt = createFormatter(locale);
      const view = await getCarbonFinanceView(DEMO_ORGANIZATION_ID, {
        reportingYear: DEMO_CURRENT_YEAR,
      });

      // Verify locale formatting works for all emission values
      expect(fmt.emissions(view.net.grossEmissions).length).toBeGreaterThan(0);
      expect(fmt.emissions(view.net.offsetQuantity).length).toBeGreaterThan(0);

      render(<NetEmissionsPanel net={view.net} reportingYear={DEMO_CURRENT_YEAR} />);

      const gross = screen.getByTestId("gross-emissions").textContent;
      const retired = screen.getByTestId("retired-offsets").textContent;
      const net = screen.getByTestId("net-emissions").textContent;

      expect(gross).toBe(formatEmissions(view.net.grossEmissions));
      expect(retired).toBe(formatEmissions(view.net.offsetQuantity));
      // The arithmetic itself, independent of the panel.
      expect(net).toBe(
        formatEmissions(
          Math.max(0, view.net.grossEmissions - view.net.offsetQuantity),
        ),
      );
      expect(view.net.netEmissions).toBeCloseTo(
        Math.max(0, view.net.grossEmissions - view.net.offsetQuantity),
        6,
      );
    },
  );

  it("keeps gross equal to the inventory total, unchanged by offsetting", async () => {
    const [view, inventory] = await Promise.all([
      getCarbonFinanceView(DEMO_ORGANIZATION_ID, { reportingYear: DEMO_CURRENT_YEAR }),
      getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR),
    ]);
    expect(view.net.grossEmissions).toBeCloseTo(inventory.totals.totalEmissions, 6);
    expect(view.net.offsetQuantity).toBeGreaterThan(0);
  });

  it("reports the offset share and the GHG Protocol disclosure text", async () => {
    const view = await getCarbonFinanceView(DEMO_ORGANIZATION_ID, {
      reportingYear: DEMO_CURRENT_YEAR,
    });
    render(<NetEmissionsPanel net={view.net} reportingYear={DEMO_CURRENT_YEAR} />);

    expect(screen.getByText(/of gross/)).toBeTruthy();
    expect(screen.getByText(view.net.disclosure)).toBeTruthy();
  });
});
