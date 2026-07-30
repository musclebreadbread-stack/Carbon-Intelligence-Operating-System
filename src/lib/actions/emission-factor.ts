"use server";

/**
 * Emission-factor library actions.
 *
 * A factor is audit-critical: changing one silently restates every calculation
 * that resolved to it. So the mutations here deliberately *never* update a factor's
 * `value` in place — they close the current validity window and create a new
 * version, which is the only way a restatement can be explained to a verifier.
 */

import { z } from "zod";

import { NotFoundError, ValidationError } from "@/lib/core/errors";
import { resolveFactor } from "@/lib/domain/factors/resolve-factor";
import { convert } from "@/lib/domain/units/convert";
import { listCandidateFactors } from "@/lib/data/repositories/emission-factor";
import { prisma } from "@/lib/prisma";
import {
  emissionFactorInputSchema,
  emissionFactorSourceInputSchema,
  emissionFactorVersionInputSchema,
  factorResolutionCriteriaSchema,
  unitConversionInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/emission-factors", "/emission-engine"] as const;

/**
 * A supersession carries the replacement's values plus the id of the factor being
 * replaced. Declared at module scope: a `'use server'` file may only *export*
 * async functions, but module-level constants are fine.
 */
const supersedeFactorSchema = emissionFactorInputSchema.and(
  z.object({ supersedesId: z.string().trim().min(1).max(64) }),
);

/** Creates a factor. */
export async function createEmissionFactorAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createEmissionFactor",
      resource: "emission_factor",
      action: "create",
      schema: emissionFactorInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.emissionFactor.create({
          data: {
            name: input.name,
            value: input.value,
            unit: input.unit,
            gasType: input.gasType,
            scope: input.scope ?? null,
            scope3Category: input.scope3Category ?? null,
            region: input.region ?? null,
            country: input.country ?? null,
            sector: input.sector ?? null,
            validFrom: input.validFrom ?? null,
            validTo: input.validTo ?? null,
            isActive: input.isActive,
            uncertainty: input.uncertainty ?? null,
            dataQuality: input.dataQuality ?? null,
            // An organisation-specific factor is scoped to the session's tenant;
            // a generic one is left global.
            organizationId: input.organizationId ? organizationId : null,
            sourceId: input.sourceId ?? null,
            categoryId: input.categoryId ?? null,
            versionId: input.versionId ?? null,
          },
        });
        return {
          data: { id: created.id },
          message: `Created factor "${input.name}".`,
          messageKey: "action.success.createEmissionFactor",
          audit: [
            auditEntry(session, {
              entityType: "EmissionFactor",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                value: input.value,
                unit: input.unit,
                gasType: input.gasType,
                validFrom: input.validFrom?.toISOString() ?? null,
                sourceId: input.sourceId ?? null,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type SupersedeResult = {
  readonly supersededId: string;
  readonly replacementId: string;
};

/**
 * Supersedes a factor: closes the old validity window at the new factor's
 * `validFrom` and creates the replacement, so historic calculations keep resolving
 * to the value that was actually applied at the time.
 */
export async function supersedeEmissionFactorAction(
  rawInput: unknown,
): Promise<ActionState<SupersedeResult>> {
  return runAction(
    {
      name: "supersedeEmissionFactor",
      resource: "emission_factor",
      action: "update",
      schema: supersedeFactorSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const previous = await prisma.emissionFactor.findUnique({
          where: { id: input.supersedesId },
        });
        if (!previous) {
          throw new NotFoundError(`Emission factor ${input.supersedesId} was not found`);
        }
        if (previous.organizationId && previous.organizationId !== organizationId) {
          throw new ValidationError(
            `Emission factor ${input.supersedesId} belongs to another tenant`,
          );
        }

        const validFrom = input.validFrom ?? new Date();
        // The previous window ends the day before the replacement takes effect.
        const closesAt = new Date(validFrom.getTime() - 24 * 60 * 60 * 1000);

        const { replacement } = await prisma.$transaction(async (tx) => {
          await tx.emissionFactor.update({
            where: { id: previous.id },
            data: { validTo: closesAt, isActive: false },
          });
          const created = await tx.emissionFactor.create({
            data: {
              name: input.name,
              value: input.value,
              unit: input.unit,
              gasType: input.gasType,
              scope: input.scope ?? previous.scope,
              scope3Category: input.scope3Category ?? previous.scope3Category,
              region: input.region ?? previous.region,
              country: input.country ?? previous.country,
              sector: input.sector ?? previous.sector,
              validFrom,
              validTo: input.validTo ?? null,
              isActive: true,
              uncertainty: input.uncertainty ?? previous.uncertainty,
              dataQuality: input.dataQuality ?? previous.dataQuality,
              organizationId: previous.organizationId,
              sourceId: input.sourceId ?? previous.sourceId,
              categoryId: input.categoryId ?? previous.categoryId,
              versionId: input.versionId ?? previous.versionId,
            },
          });
          return { replacement: created };
        });

        return {
          data: { supersededId: previous.id, replacementId: replacement.id },
          message: `Superseded "${previous.name}" with a new version effective ${validFrom.toISOString().slice(0, 10)}.`,
          messageKey: "action.success.supersedeEmissionFactor",
          audit: [
            auditEntry(session, {
              entityType: "EmissionFactor",
              entityId: previous.id,
              action: "update",
              before: { value: previous.value, validTo: previous.validTo?.toISOString() ?? null, isActive: previous.isActive },
              after: { value: previous.value, validTo: closesAt.toISOString(), isActive: false },
              reason: `Superseded by ${replacement.id}`,
            }),
            auditEntry(session, {
              entityType: "EmissionFactor",
              entityId: replacement.id,
              action: "create",
              after: { value: input.value, unit: input.unit, validFrom: validFrom.toISOString() },
              reason: `Supersedes ${previous.id}`,
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Registers a factor source. Publisher and URL are mandatory: every factor cites. */
export async function createFactorSourceAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createFactorSource",
      resource: "emission_factor",
      action: "create",
      schema: emissionFactorSourceInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.emissionFactorSource.create({
          data: {
            name: input.name,
            description: input.description ?? null,
            publisher: input.publisher,
            url: input.url,
            methodology: input.methodology ?? null,
            lastUpdated: input.lastUpdated ?? null,
          },
        });
        return {
          data: { id: created.id },
          message: `Registered factor source "${input.name}".`,
          messageKey: "action.success.createFactorSource",
          audit: [
            auditEntry(session, {
              entityType: "EmissionFactorSource",
              entityId: created.id,
              action: "create",
              after: { name: input.name, publisher: input.publisher, url: input.url },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Registers a factor-library version and demotes the previous latest. */
export async function createFactorVersionAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createFactorVersion",
      resource: "emission_factor",
      action: "create",
      schema: emissionFactorVersionInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.$transaction(async (tx) => {
          if (input.isLatest) {
            await tx.emissionFactorVersion.updateMany({
              where: { sourceId: input.sourceId, isLatest: true },
              data: { isLatest: false },
            });
          }
          return tx.emissionFactorVersion.create({
            data: {
              sourceId: input.sourceId,
              version: input.version,
              releaseDate: input.releaseDate ?? null,
              description: input.description ?? null,
              isLatest: input.isLatest,
              changelog: input.changelog ?? null,
            },
          });
        });
        return {
          data: { id: created.id },
          message: `Registered version ${input.version}.`,
          messageKey: "action.success.createFactorVersion",
          audit: [
            auditEntry(session, {
              entityType: "EmissionFactorVersion",
              entityId: created.id,
              action: "create",
              after: { version: input.version, isLatest: input.isLatest },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type FactorResolutionExplanation = {
  readonly factorId: string;
  readonly factorName: string;
  readonly value: number;
  readonly unit: string;
  readonly specificity: string;
  readonly score: number;
  readonly rationale: readonly string[];
  readonly runnersUp: readonly { readonly id: string; readonly name: string }[];
  readonly rejected: readonly { readonly factorId: string; readonly reason: string }[];
};

/**
 * "Explain which factor applies": read-only, so it works in demo mode and is what
 * the factor-library page uses to justify a selection to a verifier.
 */
export async function explainFactorResolutionAction(
  rawInput: unknown,
): Promise<ActionState<FactorResolutionExplanation>> {
  return runAction(
    {
      name: "explainFactorResolution",
      resource: "emission_factor",
      action: "read",
      schema: factorResolutionCriteriaSchema,
      readOnly: true,
      handler: async ({ input, organizationId }) => {
        const candidates = await listCandidateFactors(organizationId);
        const selection = resolveFactor(candidates, {
          date: input.date,
          scope: input.scope,
          scope3Category: input.scope3Category ?? null,
          region: input.region ?? null,
          country: input.country ?? null,
          sector: input.sector ?? null,
          organizationId,
          supplierId: input.supplierId ?? null,
          unit: input.unit ?? null,
          sourceId: input.sourceId ?? null,
          gasType: input.gasType ?? null,
        });

        return {
          data: {
            factorId: selection.factor.id,
            factorName: selection.factor.name,
            value: selection.factor.value,
            unit: selection.factor.unit,
            specificity: selection.specificity,
            score: selection.score,
            rationale: selection.selectionRationale,
            runnersUp: selection.runnersUp
              .slice(0, 5)
              .map((factor) => ({ id: factor.id, name: factor.name })),
            rejected: selection.rejected.slice(0, 20),
          },
          message: `Resolved to "${selection.factor.name}".`,
          messageKey: "action.success.explainFactorResolution",
        };
      },
    },
    rawInput,
  );
}

export type ConversionResult = {
  readonly fromUnit: string;
  readonly toUnit: string;
  readonly factor: number;
};

/** Unit-conversion tool. Read-only; uses the same converter as the engines. */
export async function convertUnitAction(
  rawInput: unknown,
): Promise<ActionState<ConversionResult>> {
  return runAction(
    {
      name: "convertUnit",
      resource: "emission_factor",
      action: "read",
      schema: unitConversionInputSchema,
      readOnly: true,
      handler: async ({ input }) => ({
        data: {
          fromUnit: input.fromUnit,
          toUnit: input.toUnit,
          factor: convert(1, input.fromUnit, input.toUnit),
        },
        message: `1 ${input.fromUnit} = ${convert(1, input.fromUnit, input.toUnit)} ${input.toUnit}`,
        messageKey: "action.success.convertUnit",
      }),
    },
    rawInput,
  );
}
