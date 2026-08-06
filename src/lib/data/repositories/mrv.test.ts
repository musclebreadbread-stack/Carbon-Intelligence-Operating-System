import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const monitoringParameterFindMany = vi.fn();
const emissionSourceFindMany = vi.fn();
const measurementFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    monitoringParameter: { findMany: (...args: unknown[]) => monitoringParameterFindMany(...args) },
    emissionSource: { findMany: (...args: unknown[]) => emissionSourceFindMany(...args) },
    measurement: { findMany: (...args: unknown[]) => measurementFindMany(...args) },
  },
}));

import { resetDataMode } from "../db";
import { DEMO_ORGANIZATION_ID } from "../demo";

import { listMeasurements, listMonitoringParameters } from "./mrv";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  process.env.DATABASE_URL = REAL_URL;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

describe("listMonitoringParameters", () => {
  it("uses the real emissionSourceId column when it points at a source that exists, instead of guessing from the name", async () => {
    emissionSourceFindMany.mockResolvedValue([
      { id: "source-boiler", name: "Boiler #1", scope: "SCOPE_1", isActive: true, facilityId: "fac-1" },
      { id: "source-electricity", name: "Grid electricity", scope: "SCOPE_2_LOCATION", isActive: true, facilityId: "fac-1" },
    ]);
    monitoringParameterFindMany.mockResolvedValue([
      {
        id: "param-1",
        monitoringPlanId: "plan-1",
        name: "Electricity meter",
        description: null,
        unit: "kWh",
        frequency: "MONTHLY",
        methodology: null,
        threshold: null,
        alertOnBreach: true,
        // Deliberately points at the boiler, the opposite of what the name
        // ("Electricity meter") would fuzzy-match — the real column must win.
        emissionSourceId: "source-boiler",
      },
    ]);

    const result = await listMonitoringParameters(DEMO_ORGANIZATION_ID, "plan-1");

    expect(result).toHaveLength(1);
    expect(result[0]?.emissionSourceId).toBe("source-boiler");
  });

  it("falls back to name matching only when emissionSourceId is unset", async () => {
    emissionSourceFindMany.mockResolvedValue([
      { id: "source-boiler", name: "Boiler #1", scope: "SCOPE_1", isActive: true, facilityId: "fac-1" },
    ]);
    monitoringParameterFindMany.mockResolvedValue([
      {
        id: "param-1",
        monitoringPlanId: "plan-1",
        name: "Boiler fuel flow",
        description: null,
        unit: "m3",
        frequency: "DAILY",
        methodology: null,
        threshold: null,
        alertOnBreach: true,
        emissionSourceId: null,
      },
    ]);

    const result = await listMonitoringParameters(DEMO_ORGANIZATION_ID, "plan-1");

    expect(result[0]?.emissionSourceId).toBe("source-boiler");
  });
});

describe("listMeasurements", () => {
  it("passes monitoringParameterId through so completeness matching no longer has to fall back to name equality", async () => {
    measurementFindMany.mockResolvedValue([
      {
        id: "m-1",
        parameter: "Electricity meter",
        value: 1200,
        unit: "kWh",
        uncertainty: null,
        frequency: "MONTHLY",
        measuredAt: new Date(Date.UTC(2024, 2, 1)),
        verifiedAt: null,
        monitoringParameterId: "param-1",
      },
    ]);

    const result = await listMeasurements("mrv-1", { reportingYear: 2024 });

    expect(result[0]?.monitoringParameterId).toBe("param-1");
  });
});
