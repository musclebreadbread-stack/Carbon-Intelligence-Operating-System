import { describe, expect, it } from "vitest";
import { z } from "zod";

import { calendarYear } from "@/lib/core/period";
import { runCalculation } from "@/lib/domain/emissions/orchestrator";
import type { EmissionFactorLike } from "@/lib/domain/factors/types";

import {
  BUILT_IN_TOOLS,
  ToolInputError,
  ToolNotFoundError,
  ToolRegistry,
  createDefaultRegistry,
} from "./tool-registry";

const factors: readonly EmissionFactorLike[] = [
  {
    id: "ef-gas",
    name: "Natural gas (DEFRA 2024)",
    value: 2.02,
    unit: "KG_CO2E_PER_M3",
    gasType: "CO2e",
    scope: "SCOPE_1",
    country: "KR",
    validFrom: new Date(Date.UTC(2024, 0, 1)),
    isActive: true,
    uncertainty: 0.05,
  },
  {
    id: "ef-grid-kr",
    name: "Korean grid 2024",
    value: 0.4594,
    unit: "KG_CO2E_PER_KWH",
    gasType: "CO2e",
    scope: "SCOPE_2_LOCATION",
    country: "KR",
    validFrom: new Date(Date.UTC(2024, 0, 1)),
    isActive: true,
  },
  {
    id: "ef-grid-global",
    name: "Global average grid",
    value: 0.6,
    unit: "KG_CO2E_PER_KWH",
    gasType: "CO2e",
    scope: "SCOPE_2_LOCATION",
    validFrom: new Date(Date.UTC(2023, 0, 1)),
    isActive: true,
  },
];

const entries = [
  {
    id: "entry-gas",
    name: "Boiler natural gas",
    quantity: 12_000,
    unit: "m3",
    scope: "SCOPE_1" as const,
    scope1SourceType: "STATIONARY" as const,
    country: "KR",
    measurementType: "METERED" as const,
  },
  {
    id: "entry-grid",
    name: "Purchased electricity",
    quantity: 850_000,
    unit: "kWh",
    scope: "SCOPE_2_LOCATION" as const,
    country: "KR",
    measurementType: "INVOICED" as const,
  },
];

describe("ToolRegistry", () => {
  it("registers and looks up a tool", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "double",
      description: "Doubles a number",
      type: "utility",
      schema: z.object({ value: z.number() }),
      execute: (input) => input.value * 2,
    });
    expect(registry.has("double")).toBe(true);
    expect(registry.size).toBe(1);
    const call = await registry.call<number>("double", { value: 21 });
    expect(call.output).toBe(42);
    expect(call.tool).toBe("double");
    expect(call.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("rejects a duplicate registration", () => {
    const registry = new ToolRegistry();
    const tool = {
      name: "x",
      description: "d",
      type: "t",
      schema: z.unknown(),
      execute: () => null,
    };
    registry.register(tool);
    expect(() => registry.register(tool)).toThrow(/already registered/);
  });

  it("throws ToolNotFoundError for an unknown name", async () => {
    const registry = new ToolRegistry();
    expect(() => registry.get("nope")).toThrow(ToolNotFoundError);
    await expect(registry.call("nope", {})).rejects.toThrow(ToolNotFoundError);
  });

  it("rejects an inactive tool", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "off",
      description: "d",
      type: "t",
      schema: z.unknown(),
      execute: () => null,
      isActive: false,
    });
    await expect(registry.call("off", {})).rejects.toThrow(/not active/);
  });

  it("emits AgentTool-shaped descriptors with parameter names", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "shaped",
      description: "A described tool",
      type: "utility",
      schema: z.object({ required: z.string(), optional: z.number().optional() }),
      execute: () => null,
    });
    const [descriptor] = registry.list();
    expect(descriptor).toMatchObject({
      name: "shaped",
      description: "A described tool",
      type: "utility",
      isActive: true,
      config: {},
    });
    expect(descriptor.schema.parameters).toEqual(["required", "optional"]);
    expect(descriptor.schema.required).toEqual(["required"]);
  });

  it("handles a non-object schema in the descriptor", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "scalar",
      description: "d",
      type: "t",
      schema: z.number(),
      execute: (input) => input,
    });
    expect(registry.list()[0].schema).toEqual({
      type: "object",
      parameters: [],
      required: [],
    });
  });

  it("rejects invalid input with the zod issue paths", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "strict",
      description: "d",
      type: "t",
      schema: z.object({ nested: z.object({ count: z.number().int() }) }),
      execute: () => null,
    });
    try {
      await registry.call("strict", { nested: { count: "many" } });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolInputError);
      const issues = (error as ToolInputError).issues;
      expect(issues[0].path).toBe("nested.count");
      expect(issues[0].message).toContain("number");
    }
  });

  it("applies schema defaults before executing", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "defaults",
      description: "d",
      type: "t",
      schema: z.object({ label: z.string().default("fallback") }),
      execute: (input) => input.label,
    });
    expect((await registry.call<string>("defaults", {})).output).toBe("fallback");
  });
});

describe("createDefaultRegistry", () => {
  it("registers every built-in tool", () => {
    const registry = createDefaultRegistry();
    expect(registry.size).toBe(BUILT_IN_TOOLS.length);
    expect(registry.names()).toEqual([
      "calculate_emissions",
      "query_inventory",
      "detect_anomalies",
      "project_scenario",
      "lookup_emission_factor",
    ]);
    for (const descriptor of registry.list()) {
      expect(descriptor.description.length).toBeGreaterThan(20);
      expect(descriptor.schema.parameters.length).toBeGreaterThan(0);
    }
  });
});

describe("calculate_emissions", () => {
  it("returns the same total as the orchestrator", async () => {
    const registry = createDefaultRegistry();
    const call = await registry.call<{ totalEmissions: number; resultCount: number }>(
      "calculate_emissions",
      {
        organizationId: "org-1",
        name: "2024 inventory",
        reportingYear: 2024,
        gwpVersion: "AR6",
        entries,
        factors: factors.map((factor) => ({
          ...factor,
          validFrom: factor.validFrom?.toISOString(),
        })),
      },
    );

    const expected = runCalculation({
      organizationId: "org-1",
      name: "2024 inventory",
      reportingYear: 2024,
      period: calendarYear(2024),
      gwpVersion: "AR6",
      candidateFactors: factors,
      entries,
    });

    expect(call.output.totalEmissions).toBeCloseTo(expected.inventory.totalEmissions, 9);
    expect(call.output.resultCount).toBe(expected.results.length);
  });

  it("breaks the total down by scope", async () => {
    const registry = createDefaultRegistry();
    const call = await registry.call<{
      scope1Total: number;
      scope2Location: number;
      scope3Total: number;
      unit: string;
      resultIds: readonly string[];
    }>("calculate_emissions", {
      organizationId: "org-1",
      reportingYear: 2024,
      entries,
      factors,
    });
    // 12 000 m3 × 2.02 kg = 24.24 tCO2e
    expect(call.output.scope1Total).toBeCloseTo(24.24, 6);
    // 850 000 kWh × 0.4594 kg = 390.49 tCO2e
    expect(call.output.scope2Location).toBeCloseTo(390.49, 6);
    expect(call.output.scope3Total).toBe(0);
    expect(call.output.unit).toBe("tCO2e");
    expect(call.output.resultIds).toEqual(["result-entry-gas", "result-entry-grid"]);
  });

  it("rejects an entry with a bad scope", async () => {
    const registry = createDefaultRegistry();
    await expect(
      registry.call("calculate_emissions", {
        organizationId: "org-1",
        reportingYear: 2024,
        entries: [{ ...entries[0], scope: "SCOPE_9" }],
        factors,
      }),
    ).rejects.toThrow(ToolInputError);
  });

  it("rejects a call with no entries or no factors", async () => {
    const registry = createDefaultRegistry();
    await expect(
      registry.call("calculate_emissions", {
        organizationId: "org-1",
        reportingYear: 2024,
        entries: [],
        factors,
      }),
    ).rejects.toThrow(ToolInputError);
    await expect(
      registry.call("calculate_emissions", {
        organizationId: "org-1",
        reportingYear: 2024,
        entries,
        factors: [],
      }),
    ).rejects.toThrow(ToolInputError);
  });
});

describe("query_inventory", () => {
  it("aggregates results by scope", async () => {
    const registry = createDefaultRegistry();
    const call = await registry.call<{
      scope1Total: number;
      scope3Total: number;
      totalEmissions: number;
      scope3ByCategory: Record<string, number>;
    }>("query_inventory", {
      results: [
        { scope: "SCOPE_1", totalCO2e: 100 },
        { scope: "SCOPE_2_LOCATION", totalCO2e: 200 },
        { scope: "SCOPE_3", scope3Category: "CAT_1_PURCHASED_GOODS", totalCO2e: 300 },
      ],
    });
    expect(call.output.scope1Total).toBe(100);
    expect(call.output.totalEmissions).toBe(600);
    expect(call.output.scope3ByCategory.CAT_1_PURCHASED_GOODS).toBe(300);
  });

  it("honours the market-basis option", async () => {
    const registry = createDefaultRegistry();
    const call = await registry.call<{ totalEmissions: number }>("query_inventory", {
      results: [
        { scope: "SCOPE_2_LOCATION", totalCO2e: 200 },
        { scope: "SCOPE_2_MARKET", totalCO2e: 50 },
      ],
      scope2Basis: "MARKET",
    });
    expect(call.output.totalEmissions).toBe(50);
  });
});

describe("detect_anomalies", () => {
  it("flags a spike and reports the statistics", async () => {
    const registry = createDefaultRegistry();
    const series = Array.from({ length: 12 }, (_, index) => ({
      at: new Date(Date.UTC(2024, index, 1)).toISOString(),
      value: index === 5 ? 500 : 100,
    }));
    const call = await registry.call<{
      anomalyCount: number;
      anomalies: readonly { severity: string; detectedValue: number }[];
      statistics: { count: number };
    }>("detect_anomalies", { series, metric: "scope1" });
    expect(call.output.anomalyCount).toBe(1);
    expect(call.output.anomalies[0].severity).toBe("CRITICAL");
    expect(call.output.anomalies[0].detectedValue).toBe(500);
    expect(call.output.statistics.count).toBe(12);
  });

  it("rejects a non-positive threshold", async () => {
    const registry = createDefaultRegistry();
    await expect(
      registry.call("detect_anomalies", {
        series: [{ at: "2024-01-01", value: 1 }],
        threshold: 0,
      }),
    ).rejects.toThrow(ToolInputError);
  });
});

describe("project_scenario", () => {
  it("projects a net-zero trajectory", async () => {
    const registry = createDefaultRegistry();
    const call = await registry.call<{
      targetEmissions: number;
      targetReduction: number;
      points: readonly unknown[];
    }>("project_scenario", {
      type: "NET_ZERO",
      targetYear: 2050,
      baseline: {
        year: 2024,
        scope1Emissions: 100,
        scope2Emissions: 100,
        scope3Emissions: 100,
      },
    });
    expect(call.output.targetEmissions).toBeCloseTo(0, 6);
    expect(call.output.targetReduction).toBeCloseTo(1, 9);
    expect(call.output.points).toHaveLength(27);
  });

  it("rejects an unknown lever", async () => {
    const registry = createDefaultRegistry();
    await expect(
      registry.call("project_scenario", {
        type: "CUSTOM",
        targetYear: 2030,
        baseline: {
          year: 2024,
          scope1Emissions: 1,
          scope2Emissions: 1,
          scope3Emissions: 1,
        },
        assumptions: [{ parameter: "magic", value: 1 }],
      }),
    ).rejects.toThrow(ToolInputError);
  });
});

describe("lookup_emission_factor", () => {
  it("resolves the country-specific factor and explains why", async () => {
    const registry = createDefaultRegistry();
    const call = await registry.call<{
      factorId: string;
      specificity: string;
      selectionRationale: readonly string[];
      runnerUpIds: readonly string[];
    }>("lookup_emission_factor", {
      candidates: factors,
      criteria: {
        date: "2024-06-30",
        scope: "SCOPE_2_LOCATION",
        country: "KR",
        unit: "kWh",
      },
    });
    expect(call.output.factorId).toBe("ef-grid-kr");
    expect(call.output.specificity).toBe("COUNTRY");
    expect(call.output.selectionRationale.length).toBeGreaterThan(0);
    expect(call.output.runnerUpIds).toContain("ef-grid-global");
  });

  it("rejects criteria with no date", async () => {
    const registry = createDefaultRegistry();
    await expect(
      registry.call("lookup_emission_factor", {
        candidates: factors,
        criteria: { scope: "SCOPE_1" },
      }),
    ).rejects.toThrow(ToolInputError);
  });
});
