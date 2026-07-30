import { describe, expect, it } from "vitest";

import { MEASUREMENT_FREQUENCIES } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { calendarYear, createPeriod } from "@/lib/core/period";

import { hashEvidence } from "../audit/hash";

import {
  MEASUREMENT_INTERVAL_HOURS,
  buildEvidencePackage,
  expectedReadings,
  measurementCompleteness,
  monitoringPlanCoverage,
  type EmissionSourceLike,
  type MeasurementLike,
  type MonitoringParameterLike,
  type MonitoringPlanLike,
} from "./plan";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const thirtyDays = createPeriod(utc("2024-01-01"), utc("2024-01-30"));

describe("expectedReadings", () => {
  it("expects 720 readings for HOURLY over 30 days", () => {
    expect(expectedReadings("HOURLY", thirtyDays)).toBe(720);
  });

  it("scales the other frequencies over the same 30 days", () => {
    expect(expectedReadings("REAL_TIME", thirtyDays)).toBe(43_200);
    expect(expectedReadings("DAILY", thirtyDays)).toBe(30);
    expect(expectedReadings("WEEKLY", thirtyDays)).toBe(4);
  });

  it("yields 12, 4 and 1 over a full calendar year", () => {
    const year = calendarYear(2023); // 365 days
    expect(expectedReadings("MONTHLY", year)).toBe(12);
    expect(expectedReadings("QUARTERLY", year)).toBe(4);
    expect(expectedReadings("ANNUALLY", year)).toBe(1);
    expect(expectedReadings("DAILY", year)).toBe(365);
    expect(expectedReadings("HOURLY", year)).toBe(8_760);
  });

  it("declares an interval for every MeasurementFrequency, coarsening monotonically", () => {
    const intervals = MEASUREMENT_FREQUENCIES.map(
      (frequency) => MEASUREMENT_INTERVAL_HOURS[frequency],
    );
    expect(intervals.every((interval) => interval > 0)).toBe(true);
    expect(intervals).toEqual([...intervals].sort((a, b) => a - b));
  });

  it("counts a single-day period inclusively", () => {
    const oneDay = createPeriod(utc("2024-03-01"), utc("2024-03-01"));
    expect(expectedReadings("HOURLY", oneDay)).toBe(24);
    expect(expectedReadings("DAILY", oneDay)).toBe(1);
  });

  it("rejects an unknown frequency", () => {
    expect(() => expectedReadings("FORTNIGHTLY" as never, thirtyDays)).toThrow(
      CalculationError,
    );
  });
});

describe("monitoringPlanCoverage", () => {
  const sources: readonly EmissionSourceLike[] = [
    { id: "s-boiler", name: "Gas boiler #1", scope: "SCOPE_1", isActive: true },
    { id: "s-fleet", name: "Delivery fleet", scope: "SCOPE_1", isActive: true },
    { id: "s-grid", name: "Purchased electricity", scope: "SCOPE_2_LOCATION", isActive: true },
    { id: "s-retired", name: "Decommissioned kiln", scope: "SCOPE_1", isActive: false },
  ];

  const plan: MonitoringPlanLike = {
    id: "mp-1",
    name: "2024 monitoring plan",
    frequency: "MONTHLY",
    startDate: utc("2024-01-01"),
    status: "active",
    parameters: [
      {
        id: "p-gas",
        name: "Natural gas volume",
        unit: "m3",
        frequency: "DAILY",
        emissionSourceId: "s-boiler",
      },
      { id: "p-gas-meter", name: "Boiler meter index", unit: "m3", emissionSourceId: "s-boiler" },
      { id: "p-kwh", name: "Grid electricity", unit: "kWh", emissionSourceId: "s-grid" },
      { id: "p-orphan", name: "Ambient temperature", unit: "C" },
      { id: "p-ghost", name: "Unknown source", unit: "kg", emissionSourceId: "s-nowhere" },
    ],
  };

  const coverage = monitoringPlanCoverage(plan, sources);

  it("reports the uncovered source", () => {
    expect(coverage.uncovered.map((entry) => entry.sourceId)).toEqual(["s-fleet"]);
    expect(coverage.uncovered[0].reason).toContain("2024 monitoring plan");
    expect(coverage.uncovered[0].scope).toBe("SCOPE_1");
    expect(coverage.isComplete).toBe(false);
  });

  it("counts only active sources towards coverage", () => {
    expect(coverage.sourceCount).toBe(3);
    expect(coverage.coveredSourceCount).toBe(2);
    expect(coverage.coverage).toBeCloseTo(2 / 3, 12);
  });

  it("lists every parameter covering a source, with its effective frequency", () => {
    const boiler = coverage.covered.find((entry) => entry.sourceId === "s-boiler");
    expect(boiler?.parameterIds).toEqual(["p-gas", "p-gas-meter"]);
    expect(boiler?.parameterCount).toBe(2);
    // p-gas-meter inherits the plan's MONTHLY frequency.
    expect(boiler?.frequencies).toEqual(["DAILY", "MONTHLY"]);
  });

  it("reports parameters with no valid source as orphans", () => {
    expect(coverage.orphanParameterIds).toEqual(["p-orphan", "p-ghost"]);
  });

  it("breaks coverage down by scope", () => {
    expect(coverage.byScope.SCOPE_1).toEqual({ covered: 1, total: 2 });
    expect(coverage.byScope.SCOPE_2_LOCATION).toEqual({ covered: 1, total: 1 });
  });

  it("reports complete coverage when every active source is monitored", () => {
    const complete = monitoringPlanCoverage(
      {
        ...plan,
        parameters: [
          ...plan.parameters,
          { id: "p-diesel", name: "Fleet diesel", unit: "L", emissionSourceId: "s-fleet" },
        ],
      },
      sources,
    );
    expect(complete.isComplete).toBe(true);
    expect(complete.coverage).toBe(1);
    expect(complete.uncovered).toEqual([]);
  });

  it("handles a plan with no parameters and a list with no sources", () => {
    const bare = monitoringPlanCoverage({ ...plan, parameters: [] }, sources);
    expect(bare.coverage).toBe(0);
    expect(bare.uncovered).toHaveLength(3);

    const noSources = monitoringPlanCoverage(plan, []);
    expect(noSources.sourceCount).toBe(0);
    expect(noSources.coverage).toBe(0);
    expect(noSources.orphanParameterIds).toHaveLength(5);
  });
});

describe("measurementCompleteness", () => {
  const parameters: readonly MonitoringParameterLike[] = [
    { id: "p-gas", name: "Natural gas volume", unit: "m3", frequency: "DAILY" },
    { id: "p-kwh", name: "Grid electricity", unit: "kWh" },
  ];

  const dailyReadings = (count: number, name: string, unit: string): MeasurementLike[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `${name}-${index}`,
      parameter: name,
      value: 100 + index,
      unit,
      measuredAt: utc(`2024-01-${String(index + 1).padStart(2, "0")}`),
    }));

  it("compares recorded readings against the expected count", () => {
    const result = measurementCompleteness(
      parameters,
      dailyReadings(25, "Natural gas volume", "m3"),
      "MONTHLY",
      thirtyDays,
    );
    const gas = result.parameters.find((row) => row.parameterId === "p-gas");
    expect(gas).toMatchObject({
      frequency: "DAILY",
      expected: 30,
      recorded: 25,
      missing: 5,
      surplus: 0,
    });
    expect(gas?.completeness).toBeCloseTo(25 / 30, 12);
  });

  it("falls back to the plan frequency when the parameter declares none", () => {
    const result = measurementCompleteness(parameters, [], "MONTHLY", thirtyDays);
    const kwh = result.parameters.find((row) => row.parameterId === "p-kwh");
    expect(kwh?.frequency).toBe("MONTHLY");
    expect(kwh?.expected).toBe(1);
  });

  it("matches readings on the parameter id where present", () => {
    const result = measurementCompleteness(
      parameters,
      [
        {
          parameter: "renamed since",
          monitoringParameterId: "p-kwh",
          value: 1,
          unit: "kWh",
          measuredAt: utc("2024-01-15"),
        },
      ],
      "MONTHLY",
      thirtyDays,
    );
    const kwh = result.parameters.find((row) => row.parameterId === "p-kwh");
    expect(kwh?.recorded).toBe(1);
    expect(result.unmatchedMeasurementCount).toBe(0);
  });

  it("excludes readings taken outside the period and reports the count", () => {
    const result = measurementCompleteness(
      parameters,
      [
        ...dailyReadings(5, "Natural gas volume", "m3"),
        {
          parameter: "Natural gas volume",
          value: 1,
          unit: "m3",
          measuredAt: utc("2023-12-15"),
        },
      ],
      "MONTHLY",
      thirtyDays,
    );
    const gas = result.parameters.find((row) => row.parameterId === "p-gas");
    expect(gas?.recorded).toBe(5);
    expect(gas?.readingsOutsidePeriod).toBe(1);
  });

  it("flags unit mismatches without dropping the reading", () => {
    const result = measurementCompleteness(
      parameters,
      dailyReadings(3, "Natural gas volume", "kWh"),
      "MONTHLY",
      thirtyDays,
    );
    const gas = result.parameters.find((row) => row.parameterId === "p-gas");
    expect(gas?.recorded).toBe(3);
    expect(gas?.unitMismatches).toBe(3);
  });

  it("counts verified readings separately", () => {
    const result = measurementCompleteness(
      parameters,
      dailyReadings(4, "Natural gas volume", "m3").map((reading, index) => ({
        ...reading,
        verifiedAt: index < 2 ? utc("2024-02-01") : null,
      })),
      "MONTHLY",
      thirtyDays,
    );
    expect(result.totalVerified).toBe(2);
    expect(result.verifiedShare).toBeCloseTo(0.5, 12);
  });

  it("aggregates completeness across parameters and lists unmeasured ones", () => {
    const result = measurementCompleteness(
      parameters,
      dailyReadings(15, "Natural gas volume", "m3"),
      "MONTHLY",
      thirtyDays,
    );
    expect(result.totalExpected).toBe(31); // 30 daily + 1 monthly
    expect(result.totalRecorded).toBe(15);
    expect(result.completeness).toBeCloseTo(15 / 31, 12);
    expect(result.unmeasuredParameterIds).toEqual(["p-kwh"]);
    expect(result.isComplete).toBe(false);
  });

  it("caps surplus readings so completeness never exceeds 1", () => {
    const result = measurementCompleteness(
      [{ id: "p-kwh", name: "Grid electricity", unit: "kWh", frequency: "MONTHLY" }],
      dailyReadings(10, "Grid electricity", "kWh"),
      "MONTHLY",
      thirtyDays,
    );
    expect(result.parameters[0].expected).toBe(1);
    expect(result.parameters[0].surplus).toBe(9);
    expect(result.parameters[0].completeness).toBe(1);
    expect(result.completeness).toBe(1);
    expect(result.isComplete).toBe(true);
  });

  it("reports readings that match no parameter", () => {
    const result = measurementCompleteness(
      parameters,
      [{ parameter: "Something else", value: 1, measuredAt: utc("2024-01-05") }],
      "MONTHLY",
      thirtyDays,
    );
    expect(result.unmatchedMeasurementCount).toBe(1);
  });

  it("rejects an inverted period", () => {
    expect(() =>
      measurementCompleteness(parameters, [], "MONTHLY", {
        start: utc("2024-02-01"),
        end: utc("2024-01-01"),
      }),
    ).toThrow(CalculationError);
  });
});

describe("buildEvidencePackage", () => {
  const items = [
    { id: "e2", name: "Gas invoice January", content: "invoice-january" },
    { id: "e1", name: "Meter log", content: "meter-log" },
  ];

  it("shapes a package to the EvidencePackage columns", () => {
    const pkg = buildEvidencePackage(items, {
      name: "Q1 verification evidence",
      description: "Invoices and meter logs supporting Scope 1",
      type: "verification",
      submittedAt: utc("2024-04-01"),
    });
    expect(pkg).toMatchObject({
      name: "Q1 verification evidence",
      type: "verification",
      fileCount: 2,
      status: "pending",
    });
    expect(pkg.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.totalSize).toBe(
      Buffer.byteLength("invoice-january") + Buffer.byteLength("meter-log"),
    );
    expect(pkg.submittedAt?.toISOString()).toBe("2024-04-01T00:00:00.000Z");
  });

  it("carries the per-item digests in the manifest", () => {
    const pkg = buildEvidencePackage(items);
    const meterLog = pkg.manifest.items.find((item) => item.id === "e1");
    expect(meterLog?.hash).toBe(hashEvidence("meter-log"));
    expect(pkg.manifest.fileCount).toBe(2);
  });

  it("is independent of the order items were added", () => {
    const forward = buildEvidencePackage(items);
    const reversed = buildEvidencePackage([...items].reverse());
    expect(reversed.hash).toBe(forward.hash);
  });

  it("changes the package hash when any item changes", () => {
    const before = buildEvidencePackage(items);
    const after = buildEvidencePackage([
      items[0],
      { id: "e1", name: "Meter log", content: "meter-log-amended" },
    ]);
    expect(after.hash).not.toBe(before.hash);
  });

  it("accepts pre-computed digests for files held in object storage", () => {
    const pkg = buildEvidencePackage([
      { id: "e1", name: "Scan", hash: hashEvidence("scan"), fileSize: 4_096 },
    ]);
    expect(pkg.fileCount).toBe(1);
    expect(pkg.totalSize).toBe(4_096);
  });

  it("defaults the name and rejects an empty package", () => {
    expect(buildEvidencePackage(items).name).toBe("Evidence package (2 item(s))");
    expect(() => buildEvidencePackage([])).toThrow(CalculationError);
  });
});
