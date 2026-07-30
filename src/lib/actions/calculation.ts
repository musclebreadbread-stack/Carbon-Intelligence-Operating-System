"use server";

/**
 * Emission-calculation actions.
 *
 * `runCalculationAction` is the heaviest write path in the system. It reads the
 * activity entries and the candidate factors for the requested period from the
 * repositories — never from the caller, so a client cannot smuggle in numbers that
 * were never recorded as activity data — runs the item-13 orchestrator, and
 * persists the whole result graph in **one** `prisma.$transaction`:
 *
 *   EmissionCalculation (one per scope)
 *   └── EmissionResult                 (one per activity entry)
 *   └── UncertaintyAnalysis            (one per calculation)
 *   DataQualityScore                   (one per activity entry)
 *   AIExplanation
 *   └── CalculationTrace               (the ordered formula steps)
 *   LineageGraph → DataLineageNode / DataLineageEdge
 *
 * `CalculationTrace` hangs off `AIExplanation` in the schema, not off
 * `EmissionCalculation`, so one explanation record per run anchors the traces.
 * That is also what the explainability UI reads.
 */

import { CalculationError } from "@/lib/core/errors";
import { buildGraph } from "@/lib/domain/lineage/graph";
import { runCalculation } from "@/lib/domain/emissions/orchestrator";
import { listCalculationEntries } from "@/lib/data/repositories/activity-data";
import {
  getCalculationOutcome,
  getInventory,
} from "@/lib/data/repositories/calculation";
import { listCandidateFactors } from "@/lib/data/repositories/emission-factor";
import { listFacilityConsolidation } from "@/lib/data/repositories/organization";
import { prisma } from "@/lib/prisma";
import {
  calculationQuerySchema,
  emissionInventoryInputSchema,
  runCalculationRequestSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/emission-engine", "/dashboard", "/analytics"] as const;

export type RunCalculationResult = {
  readonly calculationIds: readonly string[];
  readonly explanationId: string;
  readonly resultCount: number;
  readonly totalEmissions: number;
  readonly unit: string;
  readonly overallUncertainty: number;
  readonly dataQualityScore: number;
};

/** Runs and persists a full inventory calculation for one reporting year. */
export async function runCalculationAction(
  rawInput: unknown,
): Promise<ActionState<RunCalculationResult>> {
  return runAction(
    {
      name: "runCalculation",
      resource: "calculation",
      action: "create",
      schema: runCalculationRequestSchema,
      revalidate: [...PATHS],
      attributes: (input) => ({
        reportingYear: input.reportingYear,
        facilityCount: input.facilityIds.length,
      }),
      handler: async ({ session, input, organizationId }) => {
        const period =
          input.period ??
          {
            start: new Date(Date.UTC(input.reportingYear, 0, 1)),
            end: new Date(Date.UTC(input.reportingYear, 11, 31)),
          };

        const [entries, candidateFactors, facilities] = await Promise.all([
          listCalculationEntries(organizationId, input.reportingYear, {
            facilityIds: input.facilityIds,
            scopes: input.scopes,
          }),
          listCandidateFactors(organizationId),
          listFacilityConsolidation(organizationId),
        ]);

        if (entries.length === 0) {
          throw new CalculationError(
            `No activity data recorded for ${input.reportingYear}; nothing to calculate.`,
            { reportingYear: input.reportingYear },
          );
        }

        const outcome = runCalculation({
          organizationId,
          name: input.name,
          reportingYear: input.reportingYear,
          period,
          gwpVersion: input.gwpVersion,
          approach: input.approach,
          consolidationApproach: input.consolidationApproach,
          scope2Basis: input.scope2Basis,
          facilities,
          candidateFactors,
          entries,
          ...(input.monteCarlo ? { monteCarlo: input.monteCarlo } : {}),
        });

        const graph = buildGraph(outcome.lineage);

        // Everything below is one transaction: a partially written calculation
        // graph would be worse than no calculation at all.
        const persisted = await prisma.$transaction(async (tx) => {
          const calculationIds: string[] = [];

          for (const record of outcome.calculationsByScope) {
            const created = await tx.emissionCalculation.create({
              data: {
                organizationId,
                name: record.name,
                reportingYear: record.reportingYear,
                reportingPeriodStart: record.reportingPeriodStart,
                reportingPeriodEnd: record.reportingPeriodEnd,
                scope: record.scope,
                scope3Category: record.scope3Category,
                approach: record.approach,
                status: record.status,
                totalEmissions: record.totalEmissions,
                unit: record.unit,
                calculatedAt: record.calculatedAt,
              },
            });
            calculationIds.push(created.id);

            const scopeResults = outcome.results.filter(
              (result) =>
                result.scope === record.scope &&
                (record.scope !== "SCOPE_3" ||
                  result.scope3Category === record.scope3Category),
            );

            if (scopeResults.length > 0) {
              await tx.emissionResult.createMany({
                data: scopeResults.map((result) => ({
                  calculationId: created.id,
                  co2Emissions: result.co2Emissions,
                  ch4Emissions: result.ch4Emissions,
                  n2oEmissions: result.n2oEmissions,
                  hfcEmissions: result.hfcEmissions,
                  pfcEmissions: result.pfcEmissions,
                  sf6Emissions: result.sf6Emissions,
                  nf3Emissions: result.nf3Emissions,
                  totalCO2e: result.totalCO2e,
                  unit: result.unit,
                  biogenicCO2: result.biogenicCO2,
                  scope: result.scope,
                  scope3Category: result.scope3Category ?? null,
                  dataQuality: result.dataQuality,
                  calculatedAt: result.calculatedAt,
                  emissionSourceId: result.emissionSourceId ?? null,
                  facilityId: result.facilityId ?? null,
                  businessUnitId: result.businessUnitId ?? null,
                  emissionFactorId: result.emissionFactorId,
                  activityDataEntryId: result.activityDataEntryId,
                })),
              });
            }
          }

          // The uncertainty analysis is attached to the primary calculation,
          // because the column is a unique one-to-one.
          const primaryId = calculationIds[0];
          await tx.uncertaintyAnalysis.create({
            data: {
              calculationId: primaryId,
              overallUncertainty: outcome.uncertainty.overallUncertainty,
              activityDataUncertainty: outcome.uncertainty.activityDataUncertainty,
              emissionFactorUncertainty: outcome.uncertainty.emissionFactorUncertainty,
              methodologyUncertainty: outcome.uncertainty.methodologyUncertainty,
              confidenceLevel: outcome.uncertainty.confidenceLevel,
              monteCarloIterations: outcome.uncertainty.monteCarloIterations,
              lowerBound: outcome.uncertainty.lowerBound,
              upperBound: outcome.uncertainty.upperBound,
              methodology: outcome.uncertainty.methodology,
            },
          });

          // Data-quality scores are per activity entry and unique on it, so an
          // upsert keeps a re-run idempotent.
          for (const score of outcome.quality.records) {
            await tx.dataQualityScore.upsert({
              where: { activityDataEntryId: score.activityDataEntryId },
              create: {
                activityDataEntryId: score.activityDataEntryId,
                overallScore: score.overallScore,
                completeness: score.completeness,
                accuracy: score.accuracy,
                timeliness: score.timeliness,
                consistency: score.consistency,
                reliability: score.reliability,
                methodology: score.methodology,
                notes: score.notes,
                assessedAt: outcome.calculation.calculatedAt,
              },
              update: {
                overallScore: score.overallScore,
                completeness: score.completeness,
                accuracy: score.accuracy,
                timeliness: score.timeliness,
                consistency: score.consistency,
                reliability: score.reliability,
                methodology: score.methodology,
                notes: score.notes,
                assessedAt: outcome.calculation.calculatedAt,
              },
            });
          }

          // One explanation anchors every calculation trace for this run.
          const explanation = await tx.aIExplanation.create({
            data: {
              title: `${input.name} — calculation trace`,
              entityType: "EmissionCalculation",
              entityId: primaryId,
              summary: `${outcome.results.length} result(s) totalling ${outcome.inventory.totalEmissions} ${outcome.inventory.unit}.`,
              methodology: `GHG Protocol Corporate Standard, ${input.gwpVersion} GWP, ${input.consolidationApproach} consolidation, Scope 2 reported on the ${input.scope2Basis} basis.`,
              confidence: outcome.quality.aggregate.overallScore / 100,
              technicalDetail: outcome.traces
                .flatMap((trace) =>
                  trace.steps.map(
                    (step) => `${step.stepName}: ${step.formula} = ${step.output} ${step.unit}`,
                  ),
                )
                .join("\n"),
            },
          });

          const traceRows = outcome.traces.flatMap((trace) =>
            trace.steps.map((step) => ({
              explanationId: explanation.id,
              stepName: `${trace.activityDataEntryId} · ${step.stepName}`,
              formula: step.formula,
              inputs: step.inputs as never,
              output: step.output,
              unit: step.unit,
              notes: step.notes ?? null,
              orderIndex: step.orderIndex,
            })),
          );
          if (traceRows.length > 0) {
            await tx.calculationTrace.createMany({ data: traceRows });
          }

          // Lineage: the graph the provenance viewer walks.
          const lineageGraph = await tx.lineageGraph.create({
            data: {
              name: `${input.name} lineage`,
              description: `Provenance for the ${input.reportingYear} calculation.`,
              entityType: "Organization",
              entityId: organizationId,
            },
          });
          const nodeIdByKey = new Map<string, string>();
          for (const node of graph.nodes) {
            const created = await tx.dataLineageNode.create({
              data: {
                graphId: lineageGraph.id,
                name: node.name,
                type: node.type,
                entityType: node.entityType ?? null,
                entityId: node.entityId ?? null,
                metadata: (node.metadata ?? {}) as never,
              },
            });
            nodeIdByKey.set(node.id, created.id);
          }
          const edgeRows: {
            sourceNodeId: string;
            targetNodeId: string;
            relationship: string;
            transformationType: string | null;
          }[] = [];
          for (const edge of graph.edges) {
            const sourceNodeId = nodeIdByKey.get(edge.sourceNodeId);
            const targetNodeId = nodeIdByKey.get(edge.targetNodeId);
            // An edge whose endpoints were not both persisted is dropped rather
            // than written with a dangling reference.
            if (!sourceNodeId || !targetNodeId) continue;
            edgeRows.push({
              sourceNodeId,
              targetNodeId,
              relationship: edge.relationship,
              transformationType: edge.transformationType ?? null,
            });
          }
          if (edgeRows.length > 0) {
            await tx.dataLineageEdge.createMany({ data: edgeRows });
          }

          return { calculationIds, explanationId: explanation.id };
        });

        return {
          data: {
            calculationIds: persisted.calculationIds,
            explanationId: persisted.explanationId,
            resultCount: outcome.results.length,
            totalEmissions: outcome.inventory.totalEmissions,
            unit: outcome.inventory.unit,
            overallUncertainty: outcome.uncertainty.overallUncertainty,
            dataQualityScore: outcome.quality.aggregate.overallScore,
          },
          message: `Calculated ${outcome.results.length} result(s) totalling ${outcome.inventory.totalEmissions.toFixed(1)} ${outcome.inventory.unit}.`,
          messageKey: "action.success.runCalculation",
          audit: persisted.calculationIds.map((calculationId, index) =>
            auditEntry(session, {
              entityType: "EmissionCalculation",
              entityId: calculationId,
              action: "create",
              after: {
                name: outcome.calculationsByScope[index]?.name ?? input.name,
                reportingYear: input.reportingYear,
                scope: outcome.calculationsByScope[index]?.scope,
                totalEmissions: outcome.calculationsByScope[index]?.totalEmissions,
                gwpVersion: input.gwpVersion,
                consolidationApproach: input.consolidationApproach,
                entryCount: entries.length,
              },
              reason: `Calculation run for reporting year ${input.reportingYear}`,
            }),
          ),
        };
      },
    },
    rawInput,
  );
}

export type InventorySnapshot = {
  readonly reportingYear: number;
  readonly scope1Total: number;
  readonly scope2Location: number;
  readonly scope2Market: number;
  readonly scope3Total: number;
  readonly totalEmissions: number;
  readonly unit: string;
};

/** Persists an `EmissionInventory` snapshot from the computed totals. */
export async function publishInventoryAction(
  rawInput: unknown,
): Promise<ActionState<InventorySnapshot>> {
  return runAction(
    {
      name: "publishInventory",
      resource: "calculation",
      action: "approve",
      schema: emissionInventoryInputSchema,
      revalidate: [...PATHS, "/esg-disclosure"],
      handler: async ({ session, input, organizationId }) => {
        const view = await getInventory(organizationId, input.reportingYear);
        const created = await prisma.emissionInventory.create({
          data: {
            organizationId,
            name: input.name,
            reportingYear: input.reportingYear,
            baselineYear: input.baselineYear ?? null,
            scope1Total: view.consolidated.scope1Total,
            scope2Location: view.consolidated.scope2Location,
            scope2Market: view.consolidated.scope2Market,
            scope3Total: view.consolidated.scope3Total,
            totalEmissions: view.consolidated.totalEmissions,
            unit: view.consolidated.unit,
            status: input.status,
          },
        });

        return {
          data: {
            reportingYear: input.reportingYear,
            scope1Total: view.consolidated.scope1Total,
            scope2Location: view.consolidated.scope2Location,
            scope2Market: view.consolidated.scope2Market,
            scope3Total: view.consolidated.scope3Total,
            totalEmissions: view.consolidated.totalEmissions,
            unit: view.consolidated.unit,
          },
          message: `Published the ${input.reportingYear} inventory.`,
          messageKey: "action.success.publishInventory",
          audit: [
            auditEntry(session, {
              entityType: "EmissionInventory",
              entityId: created.id,
              action: "create",
              after: {
                reportingYear: input.reportingYear,
                totalEmissions: view.consolidated.totalEmissions,
                status: input.status,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type PreviewResult = {
  readonly totalEmissions: number;
  readonly unit: string;
  readonly resultCount: number;
  readonly scope1Total: number;
  readonly scope2Location: number;
  readonly scope2Market: number;
  readonly scope3Total: number;
};

/**
 * Read-only preview. Permitted in demo mode, because it writes nothing: this is
 * how the UI shows genuinely computed figures with no database.
 */
export async function previewCalculationAction(
  rawInput: unknown,
): Promise<ActionState<PreviewResult>> {
  return runAction(
    {
      name: "previewCalculation",
      resource: "calculation",
      action: "read",
      schema: calculationQuerySchema,
      readOnly: true,
      handler: async ({ input, organizationId }) => {
        const reportingYear = input.reportingYear ?? new Date().getUTCFullYear();
        const outcome = await getCalculationOutcome(organizationId, reportingYear);
        return {
          data: {
            totalEmissions: outcome.inventory.totalEmissions,
            unit: outcome.inventory.unit,
            resultCount: outcome.results.length,
            scope1Total: outcome.inventory.scope1Total,
            scope2Location: outcome.inventory.scope2Location,
            scope2Market: outcome.inventory.scope2Market,
            scope3Total: outcome.inventory.scope3Total,
          },
          message: "Preview computed without persisting anything.",
          messageKey: "action.success.previewCalculation",
        };
      },
    },
    rawInput,
  );
}
