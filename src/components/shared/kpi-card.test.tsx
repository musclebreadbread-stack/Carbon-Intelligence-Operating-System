/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfidenceBadge } from "./confidence-badge";
import { KpiCard } from "./kpi-card";
import { EmptyState } from "./empty-state";
import { StatDelta } from "./stat-delta";

describe("KpiCard", () => {
  it("renders value, unit and source", () => {
    render(
      <KpiCard
        title="Total emissions"
        value="12,450"
        unit="tCO2e"
        change={-8.2}
        description="vs 2023"
        source="buildInventory() over 24 months of activity data"
      />,
    );

    expect(screen.getByText("12,450")).toBeTruthy();
    expect(screen.getByText("tCO2e")).toBeTruthy();
    expect(screen.getByText("8.2%")).toBeTruthy();
    expect(screen.getByText(/buildInventory\(\)/)).toBeTruthy();
  });

  it("says so when there is no comparison period", () => {
    render(<KpiCard title="Scope 1" value="3,280" change={null} />);
    expect(screen.getByText(/no comparison period/i)).toBeTruthy();
  });
});

describe("StatDelta", () => {
  it("treats a fall in emissions as an improvement and a fall in achievement as a regression", () => {
    const { container: down } = render(<StatDelta change={-5} goodDirection="down" />);
    expect(down.querySelector(".text-emerald-600")).toBeTruthy();

    const { container: up } = render(<StatDelta change={-5} goodDirection="up" />);
    expect(up.querySelector(".text-red-500")).toBeTruthy();
  });
});

describe("ConfidenceBadge", () => {
  it("shows the band and the score together", () => {
    render(<ConfidenceBadge score={0.82} />);
    expect(screen.getByText(/High · 82%/)).toBeTruthy();
  });

  it("says when confidence was never scored", () => {
    render(<ConfidenceBadge score={null} />);
    expect(screen.getByText(/confidence not scored/)).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("renders the title and description", () => {
    render(<EmptyState title="No persisted analyses" description="Run one to populate this list." />);
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.getByText("No persisted analyses")).toBeTruthy();
  });
});
