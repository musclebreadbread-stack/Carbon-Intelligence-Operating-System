/**
 * Agent tool registry.
 *
 * Tools are the only way an agent touches the platform. Each one declares a zod
 * input schema and delegates straight to a domain function, so an agent can never
 * reach a calculation path the rest of the application does not also use — and an
 * invalid tool call is rejected at the boundary rather than producing a plausible
 * but wrong number.
 *
 * Descriptors are shaped to the `AgentTool` model.
 *
 * Imports zod (a pure validation library) and `src/lib/domain/**` only: no
 * framework, database or network imports.
 */

import { z } from "zod";

import { AppError } from "@/lib/core/errors";
import { GHG_SCOPES, GWP_VERSIONS, SCENARIO_TYPES, SCOPE3_CATEGORIES } from "@/lib/core/enums";
import { EMISSION_FACTOR_UNITS } from "@/lib/core/enums";
import { detectAnomalies, ANOMALY_METHODS } from "@/lib/domain/ai/anomaly";
import { buildInventory, type EmissionResultLike } from "@/lib/domain/emissions/aggregate";
import { runCalculation, SCOPE1_SOURCE_TYPES } from "@/lib/domain/emissions/orchestrator";
import { resolveFactor } from "@/lib/domain/factors/resolve-factor";
import type { EmissionFactorLike } from "@/lib/domain/factors/types";
import { MEASUREMENT_TYPES } from "@/lib/domain/quality/score";
import { projectScenario, SCENARIO_LEVERS } from "@/lib/domain/scenarios/project";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ToolNotFoundError extends AppError {
  constructor(name: string) {
    super("TOOL_NOT_FOUND", `No agent tool registered under the name "${name}"`, { name });
  }
}

export class ToolInputError extends AppError {
  readonly issues: readonly { readonly path: string; readonly message: string }[];

  constructor(
    name: string,
    issues: readonly { readonly path: string; readonly message: string }[],
  ) {
    super("TOOL_INPUT_INVALID", `Invalid input for agent tool "${name}"`, { name, issues });
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export type ToolContext = {
  /** Fixed clock, so a tool that needs "now" stays deterministic under test. */
  readonly now?: Date;
  readonly organizationId?: string;
};

export type AgentToolDefinition<TInput = unknown, TOutput = unknown> = {
  readonly name: string;
  readonly description: string;
  /** `AgentTool.type`, e.g. `"calculation"` or `"analysis"`. */
  readonly type: string;
  /**
   * Output type must be `TInput`; the *input* type is left open so schemas with
   * `.default()` or `z.coerce` (whose input differs from their output) are usable.
   */
  readonly schema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  readonly execute: (input: TInput, context: ToolContext) => TOutput | Promise<TOutput>;
  readonly isActive?: boolean;
};

/** Plain object shaped to the `AgentTool` model. */
export type AgentToolDescriptor = {
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly schema: {
    readonly type: "object";
    readonly parameters: readonly string[];
    readonly required: readonly string[];
  };
  readonly config: Readonly<Record<string, never>>;
  readonly isActive: boolean;
};

export type ToolCallResult<TOutput = unknown> = {
  readonly tool: string;
  readonly output: TOutput;
  readonly durationMs: number;
};

/** Parameter names and required flags, derived from a zod object schema. */
function describeSchema(schema: z.ZodTypeAny): AgentToolDescriptor["schema"] {
  const unwrapped = schema as unknown as { shape?: Record<string, z.ZodTypeAny> };
  const shape = unwrapped.shape;
  if (!shape) return { type: "object", parameters: [], required: [] };
  const parameters = Object.keys(shape);
  return {
    type: "object",
    parameters,
    required: parameters.filter((key) => !shape[key].isOptional()),
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition<never, unknown>>();

  register<TInput, TOutput>(tool: AgentToolDefinition<TInput, TOutput>): this {
    if (this.tools.has(tool.name)) {
      throw new AppError("TOOL_ALREADY_REGISTERED", `Tool "${tool.name}" is already registered`, {
        name: tool.name,
      });
    }
    this.tools.set(tool.name, tool as unknown as AgentToolDefinition<never, unknown>);
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): AgentToolDefinition<never, unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolNotFoundError(name);
    return tool;
  }

  get size(): number {
    return this.tools.size;
  }

  /** `AgentTool`-shaped descriptors, for persistence and for the LLM tool list. */
  list(): readonly AgentToolDescriptor[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      type: tool.type,
      schema: describeSchema(tool.schema as unknown as z.ZodTypeAny),
      config: {},
      isActive: tool.isActive ?? true,
    }));
  }

  names(): readonly string[] {
    return [...this.tools.keys()];
  }

  /**
   * Validates the input and runs the tool.
   *
   * Validation failure throws `ToolInputError` with the zod issue paths; the
   * runtime treats that as terminal rather than retryable, because a malformed
   * argument list does not become well formed on a second attempt.
   */
  async call<TOutput = unknown>(
    name: string,
    rawInput: unknown,
    context: ToolContext = {},
  ): Promise<ToolCallResult<TOutput>> {
    const tool = this.get(name);
    if (tool.isActive === false) {
      throw new AppError("TOOL_INACTIVE", `Tool "${name}" is not active`, { name });
    }
    const parsed = tool.schema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ToolInputError(
        name,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    const startedAt = Date.now();
    const output = (await tool.execute(parsed.data as never, context)) as TOutput;
    return { tool: name, output, durationMs: Date.now() - startedAt };
  }
}

// ---------------------------------------------------------------------------
// Shared schema fragments
// ---------------------------------------------------------------------------

const scopeSchema = z.enum(GHG_SCOPES);
const scope3CategorySchema = z.enum(SCOPE3_CATEGORIES);
const gwpSchema = z.enum(GWP_VERSIONS);

const factorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  value: z.number().finite(),
  unit: z.enum(EMISSION_FACTOR_UNITS),
  gasType: z.string().min(1).default("CO2e"),
  scope: scopeSchema.nullish(),
  scope3Category: scope3CategorySchema.nullish(),
  region: z.string().nullish(),
  country: z.string().nullish(),
  sector: z.string().nullish(),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  isActive: z.boolean().optional(),
  uncertainty: z.number().nullish(),
  organizationId: z.string().nullish(),
  supplierId: z.string().nullish(),
  sourceId: z.string().nullish(),
});

const entrySchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  quantity: z.number().finite(),
  unit: z.string().min(1),
  scope: scopeSchema,
  scope3Category: scope3CategorySchema.nullish(),
  scope1SourceType: z.enum(SCOPE1_SOURCE_TYPES).optional(),
  region: z.string().nullish(),
  country: z.string().nullish(),
  sector: z.string().nullish(),
  facilityId: z.string().nullish(),
  businessUnitId: z.string().nullish(),
  measurementType: z.enum(MEASUREMENT_TYPES).optional(),
});

const resultSchema = z.object({
  id: z.string().optional(),
  scope: scopeSchema,
  scope3Category: scope3CategorySchema.nullish(),
  totalCO2e: z.number().finite(),
  biogenicCO2: z.number().nullish(),
  unit: z.string().optional(),
  facilityId: z.string().nullish(),
  businessUnitId: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// Built-in tools
// ---------------------------------------------------------------------------

export const calculateEmissionsSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).default("Agent calculation"),
  reportingYear: z.number().int(),
  gwpVersion: gwpSchema.default("AR6"),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  scope2Basis: z.enum(["LOCATION", "MARKET"]).optional(),
  entries: z.array(entrySchema).min(1),
  factors: z.array(factorSchema).min(1),
});

export const calculateEmissionsTool: AgentToolDefinition<
  z.infer<typeof calculateEmissionsSchema>,
  {
    readonly totalEmissions: number;
    readonly unit: string;
    readonly scope1Total: number;
    readonly scope2Location: number;
    readonly scope2Market: number;
    readonly scope3Total: number;
    readonly resultCount: number;
    readonly resultIds: readonly string[];
    readonly overallUncertainty: number;
  }
> = {
  name: "calculate_emissions",
  description:
    "Runs the full emission calculation orchestrator over a set of activity entries and candidate emission factors, returning the inventory totals.",
  type: "calculation",
  schema: calculateEmissionsSchema,
  execute: (input) => {
    const period = {
      start: input.periodStart ?? new Date(Date.UTC(input.reportingYear, 0, 1)),
      end: input.periodEnd ?? new Date(Date.UTC(input.reportingYear, 11, 31)),
    };
    const outcome = runCalculation({
      organizationId: input.organizationId,
      name: input.name,
      reportingYear: input.reportingYear,
      period,
      gwpVersion: input.gwpVersion,
      scope2Basis: input.scope2Basis,
      candidateFactors: input.factors as readonly EmissionFactorLike[],
      entries: input.entries,
    });
    return {
      totalEmissions: outcome.inventory.totalEmissions,
      unit: outcome.inventory.unit,
      scope1Total: outcome.inventory.scope1Total,
      scope2Location: outcome.inventory.scope2Location,
      scope2Market: outcome.inventory.scope2Market,
      scope3Total: outcome.inventory.scope3Total,
      resultCount: outcome.results.length,
      resultIds: outcome.results.map((result) => result.id),
      overallUncertainty: outcome.uncertainty.overallUncertainty,
    };
  },
};

export const queryInventorySchema = z.object({
  results: z.array(resultSchema).min(1),
  scope2Basis: z.enum(["LOCATION", "MARKET"]).optional(),
  unit: z.string().optional(),
});

export const queryInventoryTool: AgentToolDefinition<
  z.infer<typeof queryInventorySchema>,
  ReturnType<typeof buildInventory>
> = {
  name: "query_inventory",
  description:
    "Aggregates emission results into inventory totals by scope, including the Scope 3 category breakdown.",
  type: "analysis",
  schema: queryInventorySchema,
  execute: (input) =>
    buildInventory(input.results as readonly EmissionResultLike[], {
      scope2Basis: input.scope2Basis,
      unit: input.unit,
    }),
};

export const detectAnomaliesSchema = z.object({
  series: z
    .array(
      z.object({
        at: z.coerce.date(),
        value: z.number().finite(),
        label: z.string().optional(),
      }),
    )
    .min(1),
  method: z.enum(ANOMALY_METHODS).optional(),
  threshold: z.number().positive().optional(),
  metric: z.string().optional(),
  unit: z.string().optional(),
  seasonLength: z.number().int().min(2).optional(),
});

export const detectAnomaliesTool: AgentToolDefinition<
  z.infer<typeof detectAnomaliesSchema>,
  {
    readonly anomalies: ReturnType<typeof detectAnomalies>["anomalies"];
    readonly statistics: ReturnType<typeof detectAnomalies>["statistics"];
    readonly method: string;
    readonly threshold: number;
    readonly anomalyCount: number;
  }
> = {
  name: "detect_anomalies",
  description:
    "Flags statistical anomalies in an emission or activity time series using leave-one-out z-scores, Tukey fences or a seasonal comparison.",
  type: "analysis",
  schema: detectAnomaliesSchema,
  execute: (input) => {
    const result = detectAnomalies(input.series, {
      method: input.method,
      threshold: input.threshold,
      metric: input.metric,
      unit: input.unit,
      seasonLength: input.seasonLength,
    });
    return {
      anomalies: result.anomalies,
      statistics: result.statistics,
      method: result.method,
      threshold: result.threshold,
      anomalyCount: result.anomalies.length,
    };
  },
};

export const projectScenarioSchema = z.object({
  type: z.enum(SCENARIO_TYPES),
  targetYear: z.number().int(),
  baseline: z.object({
    year: z.number().int(),
    scope1Emissions: z.number().finite().nonnegative(),
    scope2Emissions: z.number().finite().nonnegative(),
    scope3Emissions: z.number().finite().nonnegative(),
    energyConsumption: z.number().finite().nonnegative().optional(),
    renewableShare: z.number().min(0).max(1).optional(),
  }),
  assumptions: z
    .array(
      z.object({
        parameter: z.enum(SCENARIO_LEVERS),
        value: z.number().finite(),
        unit: z.string().nullish(),
      }),
    )
    .optional(),
});

export const projectScenarioTool: AgentToolDefinition<
  z.infer<typeof projectScenarioSchema>,
  {
    readonly type: string;
    readonly baselineEmissions: number;
    readonly targetEmissions: number;
    readonly targetReduction: number;
    readonly cumulativeEmissions: number;
    readonly cumulativeCost: number;
    readonly points: ReturnType<typeof projectScenario>["points"];
  }
> = {
  name: "project_scenario",
  description:
    "Projects a decarbonisation scenario from a base-year inventory and a set of levers, returning the year-by-year trajectory.",
  type: "simulation",
  schema: projectScenarioSchema,
  execute: (input) => {
    const projection = projectScenario({
      type: input.type,
      baseline: input.baseline,
      targetYear: input.targetYear,
      assumptions: input.assumptions,
    });
    return {
      type: projection.type,
      baselineEmissions: projection.baselineEmissions,
      targetEmissions: projection.targetEmissions,
      targetReduction: projection.targetReduction,
      cumulativeEmissions: projection.cumulativeEmissions,
      cumulativeCost: projection.cumulativeCost,
      points: projection.points,
    };
  },
};

export const lookupEmissionFactorSchema = z.object({
  candidates: z.array(factorSchema).min(1),
  criteria: z.object({
    date: z.coerce.date(),
    scope: scopeSchema,
    scope3Category: scope3CategorySchema.nullish(),
    region: z.string().nullish(),
    country: z.string().nullish(),
    sector: z.string().nullish(),
    organizationId: z.string().nullish(),
    supplierId: z.string().nullish(),
    unit: z.string().nullish(),
    gasType: z.string().nullish(),
  }),
});

export const lookupEmissionFactorTool: AgentToolDefinition<
  z.infer<typeof lookupEmissionFactorSchema>,
  {
    readonly factorId: string;
    readonly factorName: string;
    readonly value: number;
    readonly unit: string;
    readonly specificity: string;
    readonly selectionRationale: readonly string[];
    readonly runnerUpIds: readonly string[];
  }
> = {
  name: "lookup_emission_factor",
  description:
    "Resolves the applicable emission factor for a set of criteria and returns the audit rationale for the selection.",
  type: "reference",
  schema: lookupEmissionFactorSchema,
  execute: (input) => {
    const selection = resolveFactor(
      input.candidates as readonly EmissionFactorLike[],
      input.criteria,
    );
    return {
      factorId: selection.factor.id,
      factorName: selection.factor.name,
      value: selection.factor.value,
      unit: selection.factor.unit,
      specificity: selection.specificity,
      selectionRationale: selection.selectionRationale,
      runnerUpIds: selection.runnersUp.map((factor) => factor.id),
    };
  },
};

export const BUILT_IN_TOOLS = [
  calculateEmissionsTool,
  queryInventoryTool,
  detectAnomaliesTool,
  projectScenarioTool,
  lookupEmissionFactorTool,
] as const;

/** A registry pre-loaded with every built-in tool. */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of BUILT_IN_TOOLS) {
    registry.register(tool as unknown as AgentToolDefinition<never, unknown>);
  }
  return registry;
}
