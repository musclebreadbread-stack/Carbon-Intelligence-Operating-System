"use server";

/**
 * Carbon-credit and offsetting actions.
 *
 * Retirement is the one mutation in the system that destroys value irreversibly:
 * a retired credit cannot be un-retired, and double-retiring one is fraud. So
 * `retireCreditsAction` re-reads the whole portfolio *and* every existing offset
 * inside the transaction, lets the pure FIFO engine decide, and writes the offsets
 * and the credit status updates together. The engine throws on over-retirement, so
 * a request for more than is available never partially succeeds.
 */

import { NotFoundError } from "@/lib/core/errors";
import {
  netEmissions,
  retireCredits,
  type CarbonCreditLike,
  type CarbonOffsetLike,
} from "@/lib/domain/credits/registry";
import { internalCarbonPriceImpact } from "@/lib/domain/credits/pricing";
import { getInventory } from "@/lib/data/repositories/calculation";
import { prisma } from "@/lib/prisma";
import {
  carbonCreditInputSchema,
  internalCarbonPriceInputSchema,
  retireCreditsInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/carbon-credits", "/carbon-finance", "/dashboard"] as const;

export type RetireCreditsResult = {
  readonly totalRetired: number;
  readonly unit: string;
  readonly remainingAvailable: number;
  readonly offsetIds: readonly string[];
  readonly creditsAffected: number;
  /** FIFO selection explanation, for the retirement certificate. */
  readonly rationale: readonly string[];
  readonly grossEmissions: number;
  readonly netEmissions: number;
  readonly offsetShare: number;
};

/** Retires credits FIFO by vintage and records the offsets. */
export async function retireCreditsAction(
  rawInput: unknown,
): Promise<ActionState<RetireCreditsResult>> {
  return runAction(
    {
      name: "retireCredits",
      resource: "carbon_credit",
      action: "retire",
      schema: retireCreditsInputSchema,
      revalidate: [...PATHS, "/esg-disclosure"],
      attributes: (input) => ({ reportingYear: input.reportingYear }),
      handler: async ({ session, input, organizationId }) => {
        const inventory = await getInventory(organizationId, input.reportingYear);

        const persisted = await prisma.$transaction(async (tx) => {
          // Read inside the transaction: an offset written by a concurrent
          // retirement between the read and the write would be invisible outside it.
          const creditRows = await tx.carbonCredit.findMany({
            where: { organizationId },
            orderBy: [{ vintage: "asc" }, { issuedAt: "asc" }],
          });
          if (creditRows.length === 0) {
            throw new NotFoundError("No carbon credits are held by this organization");
          }
          const offsetRows = await tx.carbonOffset.findMany({
            where: { credit: { organizationId } },
            orderBy: { offsetDate: "asc" },
          });

          const credits: readonly CarbonCreditLike[] = creditRows.map((row) => ({
            id: row.id,
            serialNumber: row.serialNumber,
            registry: row.registry,
            projectName: row.projectName,
            projectType: row.projectType,
            vintage: row.vintage,
            quantity: row.quantity,
            unit: row.unit,
            status: row.status,
            verificationStandard: row.verificationStandard,
            country: row.country,
            methodology: row.methodology,
            issuedAt: row.issuedAt,
            retiredAt: row.retiredAt,
            expiresAt: row.expiresAt,
            price: row.price,
            currency: row.currency,
          }));
          const existingOffsets: readonly CarbonOffsetLike[] = offsetRows.map((row) => ({
            id: row.id,
            creditId: row.creditId,
            quantity: row.quantity,
            unit: row.unit,
            offsetDate: row.offsetDate,
            purpose: row.purpose,
            reportingYear: row.reportingYear,
            notes: row.notes,
          }));

          const offsetDate = input.offsetDate ?? new Date();
          const result = retireCredits(credits, input.quantity, {
            ...(input.vintage != null ? { vintage: input.vintage } : {}),
            ...(input.minVintage != null ? { minVintage: input.minVintage } : {}),
            ...(input.registry != null ? { registry: input.registry } : {}),
            ...(input.notes != null ? { notes: input.notes } : {}),
            purpose: input.purpose,
            reportingYear: input.reportingYear,
            offsetDate,
            existingOffsets,
          });

          const offsetIds: string[] = [];
          for (const offset of result.offsets) {
            const created = await tx.carbonOffset.create({
              data: {
                creditId: offset.creditId,
                quantity: offset.quantity,
                unit: offset.unit ?? result.unit,
                offsetDate: offset.offsetDate,
                purpose: offset.purpose ?? input.purpose,
                reportingYear: offset.reportingYear ?? input.reportingYear,
                notes: offset.notes ?? null,
              },
              select: { id: true },
            });
            offsetIds.push(created.id);
          }

          for (const update of result.creditUpdates) {
            await tx.carbonCredit.update({
              where: { id: update.creditId },
              data: { status: update.status, retiredAt: update.retiredAt },
            });
          }

          return { result, offsetIds, existingOffsets, offsetDate };
        });

        // Net emissions are reported against the *whole* year's retirements, not
        // just this one, because a claim covers the year as a whole.
        const yearOffsets = [
          ...persisted.existingOffsets,
          ...persisted.result.offsets,
        ];
        const net = netEmissions(
          inventory.consolidated.totalEmissions,
          yearOffsets,
          { reportingYear: input.reportingYear, unit: inventory.consolidated.unit },
        );

        return {
          data: {
            totalRetired: persisted.result.totalRetired,
            unit: persisted.result.unit,
            remainingAvailable: persisted.result.remainingAvailable,
            offsetIds: persisted.offsetIds,
            creditsAffected: persisted.result.creditUpdates.length,
            rationale: persisted.result.rationale,
            grossEmissions: net.grossEmissions,
            netEmissions: net.netEmissions,
            offsetShare: net.offsetShare,
          },
          message: `Retired ${persisted.result.totalRetired} ${persisted.result.unit} across ${persisted.result.creditUpdates.length} credit(s); ${persisted.result.remainingAvailable} remain available.`,
          messageKey: "action.success.retireCredits",
          audit: persisted.result.creditUpdates.map((update) =>
            auditEntry(session, {
              entityType: "CarbonCredit",
              entityId: update.creditId,
              action: "update",
              after: {
                retiredQuantity: update.retiredQuantity,
                remainingQuantity: update.remainingQuantity,
                status: update.status,
                purpose: input.purpose,
                reportingYear: input.reportingYear,
              },
              reason: `Retirement: ${input.purpose}`,
            }),
          ),
        };
      },
    },
    rawInput,
  );
}

/** Records a credit purchase or issuance into the portfolio. */
export async function createCarbonCreditAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createCarbonCredit",
      resource: "carbon_credit",
      action: "create",
      schema: carbonCreditInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.carbonCredit.create({
          data: {
            organizationId,
            serialNumber: input.serialNumber ?? null,
            registry: input.registry ?? null,
            projectName: input.projectName ?? null,
            projectType: input.projectType ?? null,
            vintage: input.vintage ?? null,
            quantity: input.quantity,
            unit: input.unit,
            status: input.status,
            verificationStandard: input.verificationStandard ?? null,
            country: input.country ?? null,
            methodology: input.methodology ?? null,
            issuedAt: input.issuedAt ?? null,
            retiredAt: input.retiredAt ?? null,
            expiresAt: input.expiresAt ?? null,
            price: input.price ?? null,
            currency: input.currency ?? null,
          },
          select: { id: true },
        });
        return {
          data: { id: created.id },
          message: `Registered ${input.quantity} ${input.unit} of ${input.projectName ?? "carbon credits"}.`,
          messageKey: "action.success.createCarbonCredit",
          audit: [
            auditEntry(session, {
              entityType: "CarbonCredit",
              entityId: created.id,
              action: "create",
              after: {
                serialNumber: input.serialNumber ?? null,
                registry: input.registry ?? null,
                vintage: input.vintage ?? null,
                quantity: input.quantity,
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

export type InternalPriceResult = {
  readonly id: string;
  readonly shadowCost: number;
  readonly currency: string;
  readonly byScope: Readonly<Record<string, number>>;
};

/** Sets an internal carbon price and reports the shadow cost it implies. */
export async function setInternalCarbonPriceAction(
  rawInput: unknown,
): Promise<ActionState<InternalPriceResult>> {
  return runAction(
    {
      name: "setInternalCarbonPrice",
      resource: "carbon_credit",
      action: "create",
      schema: internalCarbonPriceInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        // The price applies from `effectiveFrom`, so the shadow cost is reported
        // against that year's inventory rather than whatever year is current.
        const reportingYear = input.effectiveFrom.getUTCFullYear();
        const inventory = await getInventory(organizationId, reportingYear);

        const impact = internalCarbonPriceImpact(
          {
            totalEmissions: inventory.consolidated.totalEmissions,
            byScope: {
              scope1: inventory.consolidated.scope1Total,
              scope2: inventory.consolidated.scope2Location,
              scope3: inventory.consolidated.scope3Total,
            },
            emissionUnit: inventory.consolidated.unit,
          },
          {
            price: input.price,
            currency: input.currency,
            unit: input.unit,
            purpose: input.purpose ?? null,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
            methodology: input.methodology ?? null,
          },
        );

        const created = await prisma.internalCarbonPrice.create({
          data: {
            organizationId,
            price: input.price,
            currency: input.currency,
            unit: input.unit,
            purpose: input.purpose ?? null,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
            methodology: input.methodology ?? null,
            approvedBy: input.approvedBy ?? null,
          },
          select: { id: true },
        });

        return {
          data: {
            id: created.id,
            shadowCost: impact.shadowCost,
            currency: impact.currency,
            byScope: impact.byScope,
          },
          message: `Internal price of ${input.price} ${input.currency}/t implies a ${impact.shadowCost.toFixed(0)} ${impact.currency} shadow cost for ${reportingYear}.`,
          messageKey: "action.success.setInternalCarbonPrice",
          audit: [
            auditEntry(session, {
              entityType: "InternalCarbonPrice",
              entityId: created.id,
              action: "create",
              after: {
                price: input.price,
                currency: input.currency,
                unit: input.unit,
                effectiveFrom: input.effectiveFrom.toISOString(),
                shadowCost: impact.shadowCost,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
