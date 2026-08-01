"use server";

/**
 * Master-data actions.
 *
 * These entities are shared reference data, so the mutations are deliberately thin:
 * validate, write, audit. The interesting rules (calorific values consistent with
 * the fuel category, refrigerant GWP present) are enforced by the item-27 schemas,
 * not repeated here.
 */

import { prisma } from "@/lib/prisma";
import {
  energySourceInputSchema,
  fuelInputSchema,
  logisticsRouteInputSchema,
  productInputSchema,
  rawMaterialInputSchema,
  refrigerantInputSchema,
  supplierInputSchema,
  vehicleInputSchema,
  wasteTypeInputSchema,
  waterSourceInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/master-data", "/activity-data"] as const;

export async function createSupplierAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createSupplier",
      resource: "master_data",
      action: "create",
      schema: supplierInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.supplier.create({
          data: {
            organizationId,
            name: input.name,
            code: input.code ?? null,
            category: input.category ?? null,
            country: input.country ?? null,
            contactEmail: input.contactEmail ?? null,
            tier: input.tier,
            sustainabilityRating: input.sustainabilityRating ?? null,
            isActive: input.isActive,
          },
        });
        return {
          data: { id: created.id },
          message: `Created supplier "${input.name}".`,
          messageKey: "action.success.createSupplier",
          audit: [
            auditEntry(session, {
              entityType: "Supplier",
              entityId: created.id,
              action: "create",
              after: { name: input.name, tier: input.tier, country: input.country ?? null },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export async function createProductAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createProduct",
      resource: "master_data",
      action: "create",
      schema: productInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.product.create({
          data: {
            organizationId,
            name: input.name,
            sku: input.sku ?? null,
            category: input.category ?? null,
            description: input.description ?? null,
            unit: input.unit ?? null,
            weight: input.weight ?? null,
            weightUnit: input.weightUnit ?? null,
            lifecycleStage: input.lifecycleStage ?? null,
            isActive: input.isActive,
          },
        });
        return {
          data: { id: created.id },
          message: `Created product "${input.name}".`,
          messageKey: "action.success.createProduct",
          audit: [
            auditEntry(session, {
              entityType: "Product",
              entityId: created.id,
              action: "create",
              after: { name: input.name, sku: input.sku ?? null },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export async function createFuelAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createFuel",
      resource: "master_data",
      action: "create",
      schema: fuelInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.fuel.create({
          data: {
            name: input.name,
            fuelTypeId: input.fuelTypeId,
            unit: input.unit,
            netCalorific: input.netCalorific ?? null,
            grossCalorific: input.grossCalorific ?? null,
            density: input.density ?? null,
            carbonContent: input.carbonContent ?? null,
            isRenewable: input.isRenewable,
          },
        });
        return {
          data: { id: created.id },
          message: `Created fuel "${input.name}".`,
          messageKey: "action.success.createFuel",
          audit: [
            auditEntry(session, {
              entityType: "Fuel",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                unit: input.unit,
                netCalorific: input.netCalorific ?? null,
                isRenewable: input.isRenewable,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export async function createVehicleAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createVehicle",
      resource: "master_data",
      action: "create",
      schema: vehicleInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.vehicle.create({
          data: {
            name: input.name,
            type: input.type,
            fuelType: input.fuelType ?? null,
            make: input.make ?? null,
            model: input.model ?? null,
            year: input.year ?? null,
            efficiency: input.efficiency ?? null,
            efficiencyUnit: input.efficiencyUnit ?? null,
            isOwned: input.isOwned,
          },
        });
        return {
          data: { id: created.id },
          message: `Created vehicle "${input.name}".`,
          messageKey: "action.success.createVehicle",
          audit: [
            auditEntry(session, {
              entityType: "Vehicle",
              entityId: created.id,
              action: "create",
              after: { name: input.name, type: input.type, isOwned: input.isOwned },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export async function createRefrigerantAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createRefrigerant",
      resource: "master_data",
      action: "create",
      schema: refrigerantInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.refrigerant.create({
          data: {
            name: input.name,
            chemicalFormula: input.chemicalFormula ?? null,
            gwp100: input.gwp100,
            gwp20: input.gwp20 ?? null,
            ozoneDepletionPotential: input.ozoneDepletionPotential ?? null,
            category: input.category ?? null,
          },
        });
        return {
          data: { id: created.id },
          message: `Created refrigerant "${input.name}".`,
          messageKey: "action.success.createRefrigerant",
          audit: [
            auditEntry(session, {
              entityType: "Refrigerant",
              entityId: created.id,
              action: "create",
              after: { name: input.name, gwp100: input.gwp100 },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export async function createRawMaterialAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createRawMaterial",
      resource: "master_data",
      action: "create",
      schema: rawMaterialInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.rawMaterial.create({
          data: {
            name: input.name,
            category: input.category ?? null,
            unit: input.unit ?? null,
            emissionIntensity: input.emissionIntensity ?? null,
            sourceRegion: input.sourceRegion ?? null,
            isRecycled: input.isRecycled,
            recycledContent: input.recycledContent ?? null,
          },
        });
        return {
          data: { id: created.id },
          message: `Created raw material "${input.name}".`,
          messageKey: "action.success.createRawMaterial",
          audit: [
            auditEntry(session, {
              entityType: "RawMaterial",
              entityId: created.id,
              action: "create",
              after: { name: input.name, isRecycled: input.isRecycled },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export async function createLogisticsRouteAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createLogisticsRoute",
      resource: "master_data",
      action: "create",
      schema: logisticsRouteInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.logisticsRoute.create({
          data: {
            name: input.name,
            origin: input.origin,
            destination: input.destination,
            distance: input.distance,
            distanceUnit: input.distanceUnit,
            transportMode: input.transportMode,
            isReturn: input.isReturn,
          },
        });
        return {
          data: { id: created.id },
          message: `Created route "${input.name}".`,
          messageKey: "action.success.createLogisticsRoute",
          audit: [
            auditEntry(session, {
              entityType: "LogisticsRoute",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                distance: input.distance,
                transportMode: input.transportMode,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export async function createEnergySourceAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createEnergySource",
      resource: "master_data",
      action: "create",
      schema: energySourceInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.energySource.create({
          data: {
            name: input.name,
            type: input.type,
            provider: input.provider ?? null,
            gridRegion: input.gridRegion ?? null,
            renewablePercent: input.renewablePercent ?? null,
            contractType: input.contractType ?? null,
          },
        });
        return {
          data: { id: created.id },
          message: `Created energy source "${input.name}".`,
          messageKey: "action.success.createEnergySource",
          audit: [
            auditEntry(session, {
              entityType: "EnergySource",
              entityId: created.id,
              action: "create",
              after: { name: input.name, type: input.type },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export async function createWasteTypeAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createWasteType",
      resource: "master_data",
      action: "create",
      schema: wasteTypeInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.wasteType.create({
          data: {
            name: input.name,
            category: input.category ?? null,
            disposalMethod: input.disposalMethod ?? null,
            isHazardous: input.isHazardous,
            recyclingRate: input.recyclingRate ?? null,
          },
        });
        return {
          data: { id: created.id },
          message: `Created waste type "${input.name}".`,
          messageKey: "action.success.createWasteType",
          audit: [
            auditEntry(session, {
              entityType: "WasteType",
              entityId: created.id,
              action: "create",
              after: { name: input.name, isHazardous: input.isHazardous },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export async function createWaterSourceAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createWaterSource",
      resource: "master_data",
      action: "create",
      schema: waterSourceInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input }) => {
        const created = await prisma.waterSource.create({
          data: {
            name: input.name,
            type: input.type ?? null,
            source: input.source ?? null,
            treatment: input.treatment ?? null,
            isRecycled: input.isRecycled,
          },
        });
        return {
          data: { id: created.id },
          message: `Created water source "${input.name}".`,
          messageKey: "action.success.createWaterSource",
          audit: [
            auditEntry(session, {
              entityType: "WaterSource",
              entityId: created.id,
              action: "create",
              after: { name: input.name, isRecycled: input.isRecycled },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
