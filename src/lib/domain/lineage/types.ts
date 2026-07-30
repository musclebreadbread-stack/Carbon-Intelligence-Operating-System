/**
 * Data-lineage descriptors.
 *
 * The engines emit *descriptors* — a declarative statement that "this activity
 * entry fed this result via this transformation" — and the graph builder turns
 * them into `DataLineageNode` / `DataLineageEdge` / `DataTransformation` shaped
 * records. Splitting the two means the calculation engines never need to know
 * about node ids or graph structure.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

/** `DataLineageNode.type` values used across the platform. */
export const LINEAGE_NODE_TYPES = [
  "DATA_SOURCE",
  "ACTIVITY_DATA",
  "EMISSION_FACTOR",
  "CALCULATION",
  "EMISSION_RESULT",
  "INVENTORY",
  "DISCLOSURE",
] as const;
export type LineageNodeType = (typeof LINEAGE_NODE_TYPES)[number];

/** `DataLineageEdge.relationship` values used across the platform. */
export const LINEAGE_RELATIONSHIPS = [
  "INPUT_TO",
  "APPLIED_TO",
  "DERIVED_FROM",
  "AGGREGATED_INTO",
  "REPORTED_IN",
] as const;
export type LineageRelationship = (typeof LINEAGE_RELATIONSHIPS)[number];

export type LineageNodeDescriptor = {
  /** Stable, human-meaningful key; the graph builder derives the node id from it. */
  readonly key: string;
  readonly name: string;
  readonly type: LineageNodeType;
  /** Prisma model name this node stands for, e.g. `"ActivityDataEntry"`. */
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
};

export type LineageTransformationDescriptor = {
  readonly name: string;
  /** `DataTransformation.type`, e.g. `"emission-calculation"`. */
  readonly type: string;
  readonly description?: string | null;
  /** Formula or method label, stored in `DataTransformation.logic`. */
  readonly logic?: string | null;
  readonly parameters?: Readonly<Record<string, unknown>> | null;
  readonly version?: string | null;
};

export type LineageEdgeDescriptor = {
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly relationship: LineageRelationship;
  readonly transformationType?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly transformation?: LineageTransformationDescriptor | null;
};

/** What an engine hands to `buildGraph`. */
export type LineageDescriptorSet = {
  readonly nodes: readonly LineageNodeDescriptor[];
  readonly edges: readonly LineageEdgeDescriptor[];
};
