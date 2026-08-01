/**
 * Digital MRV repository.
 *
 * The property under test is the one the schema change bought (defect 5):
 * `MonitoringParameter.emissionSourceId` is *read*, not guessed. The previous
 * implementation inferred the association by testing whether the parameter's name
 * contained the first word of a source's name, first unclaimed source winning, which
 * could report a plan as monitoring a source it did not monitor — a false coverage
 * claim in an assurance context — and which disagreed with demo mode, where the
 * fixture carries the association explicitly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const monitoringParameterFindMany = vi.fn();
const mrvPlanFindFirst = vi.fn();
const monitoringPlanFindMany = vi.fn();
const measurementFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    monitoringParameter: {
      findMany: (...args: unknown[]) => monitoringParameterFindMany(...args),
    },
    mRVPlan: { findFirst: (...args: unknown[]) => mrvPlanFindFirst(...args) },
    monitoringPlan: { findMany: (...args: unknown[]) => monitoringPlanFindMany(...args) },
    measurement: { findMany: (...args: unknown[]) => measurementFindMany(...args) },
  },
}));

const listEmissionSources = vi.fn();

vi.mock("./organization", () => ({
  listEmissionSources: (...args: unknown[]) => listEmissionSources(...args),
}));

import { getDataMode, resetDataMode } from "../db";
import {
  DEMO_MONITORING_PARAMETERS,
  DEMO_MONITORING_PLAN,
  DEMO_ORGANIZATION_ID,
} from "../demo";

import { listMonitoringParameters } from "./mrv";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

/** A Prisma-style "cannot reach the database server" failure. */
function p1001(): Error & { code: string } {
  const error = new Error("Can't reach database server at db.internal:5432") as Error & {
    code: string;
  };
  error.code = "P1001";
  return error;
}

/** One persisted `MonitoringParameter` row, with overridable fields. */
function parameterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mp-1",
    monitoringPlanId: "plan-1",
    name: "Ulsan boiler gas flow",
    description: "Custody-transfer gas meter",
    unit: "m3",
    frequency: "HOURLY",
    methodology: "Ultrasonic flow meter",
    threshold: 220_000,
    alertOnBreach: true,
    emissionSourceId: "src-boiler",
    ...overrides,
  };
}

const TENANT_SOURCES = [
  { id: "src-boiler", name: "Ulsan LNG boiler", code: "S-01" },
  { id: "src-grid", name: "Ulsan grid electricity", code: "S-02" },
];

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  process.env.DATABASE_URL = REAL_URL;
  listEmissionSources.mockResolvedValue(TENANT_SOURCES);
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

describe("listMonitoringParameters against a database", () => {
  it("projects the stored emissionSourceId straight through", async () => {
    monitoringParameterFindMany.mockResolvedValue([parameterRow()]);

    const [parameter] = await listMonitoringParameters(DEMO_ORGANIZATION_ID, "plan-1");

    expect(getDataMode()).toBe("database");
    expect(parameter.emissionSourceId).toBe("src-boiler");
    expect(parameter.unit).toBe("m3");
    expect(parameter.threshold).toBe(220_000);
  });

  it("reports an unassigned parameter as null rather than inventing an association", async () => {
    // The old heuristic would have matched this on the word "Ulsan".
    monitoringParameterFindMany.mockResolvedValue([
      parameterRow({ name: "Ulsan something unmonitored", emissionSourceId: null }),
    ]);

    const [parameter] = await listMonitoringParameters(DEMO_ORGANIZATION_ID, "plan-1");

    expect(parameter.emissionSourceId).toBeNull();
  });

  it("does not honour a source belonging to another tenant", async () => {
    // The foreign key is not tenant-aware, so a cross-tenant id must be dropped
    // instead of leaking another organisation's source into a coverage report.
    monitoringParameterFindMany.mockResolvedValue([
      parameterRow({ emissionSourceId: "src-of-another-company" }),
    ]);

    const [parameter] = await listMonitoringParameters(DEMO_ORGANIZATION_ID, "plan-1");

    expect(parameter.emissionSourceId).toBeNull();
  });

  it("does not reassign two parameters that monitor the same source", async () => {
    // The old implementation "claimed" each source, so the second parameter for one
    // source silently became unmonitored.
    monitoringParameterFindMany.mockResolvedValue([
      parameterRow({ id: "mp-1", emissionSourceId: "src-boiler" }),
      parameterRow({ id: "mp-2", name: "Ulsan boiler gas pressure", emissionSourceId: "src-boiler" }),
    ]);

    const parameters = await listMonitoringParameters(DEMO_ORGANIZATION_ID, "plan-1");

    expect(parameters.map((row) => row.emissionSourceId)).toEqual([
      "src-boiler",
      "src-boiler",
    ]);
  });

  it("normalises a null description to an empty string", async () => {
    monitoringParameterFindMany.mockResolvedValue([parameterRow({ description: null })]);

    const [parameter] = await listMonitoringParameters(DEMO_ORGANIZATION_ID, "plan-1");

    expect(parameter.description).toBe("");
  });
});

describe("listMonitoringParameters in demo mode", () => {
  it("falls back to the fixtures and reports demo mode when the database is unreachable", async () => {
    monitoringParameterFindMany.mockRejectedValue(p1001());

    const parameters = await listMonitoringParameters(
      DEMO_ORGANIZATION_ID,
      DEMO_MONITORING_PLAN.id,
    );

    expect(getDataMode()).toBe("demo");
    expect(parameters).toHaveLength(DEMO_MONITORING_PARAMETERS.length);
  });

  it("carries the same emissionSourceId shape the database path returns", async () => {
    // This is the invariant the column exists for: demo mode and database mode must
    // not disagree about which sources are monitored.
    monitoringParameterFindMany.mockRejectedValue(p1001());

    const parameters = await listMonitoringParameters(
      DEMO_ORGANIZATION_ID,
      DEMO_MONITORING_PLAN.id,
    );

    for (const parameter of parameters) {
      expect(
        parameter.emissionSourceId === null ||
          typeof parameter.emissionSourceId === "string",
      ).toBe(true);
    }
    expect(parameters.every((parameter) => parameter.emissionSourceId !== null)).toBe(true);
  });
});
