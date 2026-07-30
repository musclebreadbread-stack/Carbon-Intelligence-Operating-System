/** @vitest-environment jsdom */

/**
 * Proof that the simulator charts a *computed* pathway.
 *
 * The 2030 cell the page renders for the NET_ZERO scenario is compared against a
 * direct `projectScenario()` call over the same calculated baseline. If the page
 * ever goes back to a hardcoded series, this fails.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resetDataMode } from "@/lib/data/db";
import { DEMO_CURRENT_YEAR, DEMO_ORGANIZATION_ID } from "@/lib/data/demo";
import {
  getInventory,
  resetDemoCalculationCache,
} from "@/lib/data/repositories/calculation";
import { listScenarioProjections } from "@/lib/data/repositories/scenario";
import { projectScenario } from "@/lib/domain/scenarios/project";
import { formatEmissions } from "@/lib/format";

import { ProjectionTable } from "./projection-table";

describe("ai-simulator projection table", () => {
  beforeEach(() => {
    resetDataMode();
    resetDemoCalculationCache();
  });

  it("renders the 2030 NET_ZERO total that projectScenario() computes", async () => {
    const projections = await listScenarioProjections(DEMO_ORGANIZATION_ID);
    const netZero = projections.find((view) => view.scenario.type === "NET_ZERO");
    expect(netZero).toBeDefined();
    if (!netZero) return;

    // Recompute independently from the calculated baseline inventory.
    const inventory = await getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);
    const expected = projectScenario({
      type: "NET_ZERO",
      name: netZero.scenario.name,
      targetYear: netZero.scenario.targetYear,
      baseline: {
        year: netZero.scenario.baselineYear,
        scope1Emissions: inventory.totals.scope1Total,
        scope2Emissions: inventory.totals.scope2Location,
        scope3Emissions: inventory.totals.scope3Total,
      },
      assumptions: netZero.scenario.assumptions,
    });

    const expected2030 = expected.points.find((point) => point.year === 2030);
    expect(expected2030).toBeDefined();
    if (!expected2030) return;

    render(<ProjectionTable points={netZero.projection.points} highlightYears={[2030]} />);

    expect(screen.getByTestId("projection-total-2030").textContent).toBe(
      formatEmissions(expected2030.totalEmissions),
    );
  });

  it("renders one row per projected year, inclusive of both endpoints", async () => {
    const projections = await listScenarioProjections(DEMO_ORGANIZATION_ID);
    const netZero = projections.find((view) => view.scenario.type === "NET_ZERO");
    if (!netZero) throw new Error("fixture is missing a NET_ZERO scenario");

    render(<ProjectionTable points={netZero.projection.points} />);

    const rows = screen.getByTestId("projection-table").querySelectorAll("tbody tr");
    expect(rows.length).toBe(
      netZero.scenario.targetYear - netZero.scenario.baselineYear + 1,
    );
    expect(screen.getByTestId(`projection-row-${netZero.scenario.baselineYear}`)).toBeTruthy();
    expect(screen.getByTestId(`projection-row-${netZero.scenario.targetYear}`)).toBeTruthy();
  });

  it("reaches approximately zero at the net-zero target year", async () => {
    const projections = await listScenarioProjections(DEMO_ORGANIZATION_ID);
    const netZero = projections.find((view) => view.scenario.type === "NET_ZERO");
    if (!netZero) throw new Error("fixture is missing a NET_ZERO scenario");

    const baseline = netZero.projection.baselineEmissions;
    const target = netZero.projection.targetEmissions;
    expect(target).toBeLessThan(baseline * 0.15);
  });
});
