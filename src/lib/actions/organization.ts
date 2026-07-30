"use server";

/**
 * Organisation-hierarchy actions.
 *
 * The parent reference of every level is re-read from the database and checked
 * against the session's tenant before the child is created, so a well-formed
 * payload cannot graft a facility onto another company's business unit.
 */

import { NotFoundError } from "@/lib/core/errors";
import { prisma } from "@/lib/prisma";
import {
  buildingInputSchema,
  businessUnitInputSchema,
  emissionSourceInputSchema,
  equipmentInputSchema,
  facilityInputSchema,
  organizationInputSchema,
  productionLineInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/organization", "/dashboard", "/settings"] as const;

/** Updates the organisation profile. */
export async function updateOrganizationAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "updateOrganization",
      resource: "organization",
      action: "update",
      schema: organizationInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const before = await prisma.organization.findUnique({ where: { id: organizationId } });
        if (!before) throw new NotFoundError(`Organization ${organizationId} was not found`);

        const updated = await prisma.organization.update({
          where: { id: organizationId },
          data: {
            name: input.name,
            legalName: input.legalName ?? null,
            industry: input.industry ?? null,
            sector: input.sector ?? null,
            country: input.country ?? null,
            region: input.region ?? null,
            address: input.address ?? null,
            website: input.website ?? null,
            fiscalYearStart: input.fiscalYearStart,
            baseCurrency: input.baseCurrency,
            reportingYear: input.reportingYear ?? null,
          },
        });

        return {
          data: { id: updated.id },
          message: "Organisation profile updated.",
          messageKey: "action.success.updateOrganization",
          audit: [
            auditEntry(session, {
              entityType: "Organization",
              entityId: organizationId,
              action: "update",
              before: {
                name: before.name,
                fiscalYearStart: before.fiscalYearStart,
                baseCurrency: before.baseCurrency,
                reportingYear: before.reportingYear,
              },
              after: {
                name: updated.name,
                fiscalYearStart: updated.fiscalYearStart,
                baseCurrency: updated.baseCurrency,
                reportingYear: updated.reportingYear,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Creates a business unit. */
export async function createBusinessUnitAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createBusinessUnit",
      resource: "organization",
      action: "create",
      schema: businessUnitInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.businessUnit.create({
          data: {
            organizationId,
            name: input.name,
            code: input.code ?? null,
            description: input.description ?? null,
            tier: input.tier,
            isActive: input.isActive,
          },
        });
        return {
          data: { id: created.id },
          message: `Created business unit "${input.name}".`,
          messageKey: "action.success.createBusinessUnit",
          audit: [
            auditEntry(session, {
              entityType: "BusinessUnit",
              entityId: created.id,
              action: "create",
              after: { name: input.name, code: input.code ?? null, tier: input.tier },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Creates a facility under a business unit of the session's organisation. */
export async function createFacilityAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createFacility",
      resource: "organization",
      action: "create",
      schema: facilityInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        if (input.businessUnitId) {
          const unit = await prisma.businessUnit.findUnique({
            where: { id: input.businessUnitId },
            select: { organizationId: true },
          });
          if (!unit || unit.organizationId !== organizationId) {
            throw new NotFoundError(`Business unit ${input.businessUnitId} was not found`);
          }
        }

        const created = await prisma.facility.create({
          data: {
            organizationId,
            businessUnitId: input.businessUnitId ?? null,
            name: input.name,
            code: input.code ?? null,
            type: input.type ?? null,
            address: input.address ?? null,
            city: input.city ?? null,
            state: input.state ?? null,
            country: input.country ?? null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            area: input.area ?? null,
            areaUnit: input.areaUnit ?? null,
            operationalControl: input.operationalControl,
            equityShare: input.equityShare,
            isActive: input.isActive,
          },
        });
        return {
          data: { id: created.id },
          message: `Created facility "${input.name}".`,
          messageKey: "action.success.createFacility",
          audit: [
            auditEntry(session, {
              entityType: "Facility",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                operationalControl: input.operationalControl,
                equityShare: input.equityShare,
                country: input.country ?? null,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Creates a building under a facility of the session's organisation. */
export async function createBuildingAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createBuilding",
      resource: "organization",
      action: "create",
      schema: buildingInputSchema,
      revalidate: [...PATHS],
      attributes: (input) => ({ facilityId: input.facilityId }),
      handler: async ({ session, input, organizationId }) => {
        const facility = await prisma.facility.findUnique({
          where: { id: input.facilityId },
          select: { organizationId: true },
        });
        if (!facility || facility.organizationId !== organizationId) {
          throw new NotFoundError(`Facility ${input.facilityId} was not found`);
        }
        const created = await prisma.building.create({
          data: {
            facilityId: input.facilityId,
            name: input.name,
            code: input.code ?? null,
            type: input.type ?? null,
            floors: input.floors ?? null,
            area: input.area ?? null,
            areaUnit: input.areaUnit ?? null,
            yearBuilt: input.yearBuilt ?? null,
            energyRating: input.energyRating ?? null,
            isActive: input.isActive,
          },
        });
        return {
          data: { id: created.id },
          message: `Created building "${input.name}".`,
          messageKey: "action.success.createBuilding",
          audit: [
            auditEntry(session, {
              entityType: "Building",
              entityId: created.id,
              action: "create",
              after: { name: input.name, facilityId: input.facilityId },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Creates a production line under a building. */
export async function createProductionLineAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createProductionLine",
      resource: "organization",
      action: "create",
      schema: productionLineInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const building = await prisma.building.findUnique({
          where: { id: input.buildingId },
          select: { facility: { select: { organizationId: true } } },
        });
        if (!building || building.facility.organizationId !== organizationId) {
          throw new NotFoundError(`Building ${input.buildingId} was not found`);
        }
        const created = await prisma.productionLine.create({
          data: {
            buildingId: input.buildingId,
            name: input.name,
            code: input.code ?? null,
            type: input.type ?? null,
            capacity: input.capacity ?? null,
            capacityUnit: input.capacityUnit ?? null,
            isActive: input.isActive,
          },
        });
        return {
          data: { id: created.id },
          message: `Created production line "${input.name}".`,
          messageKey: "action.success.createProductionLine",
          audit: [
            auditEntry(session, {
              entityType: "ProductionLine",
              entityId: created.id,
              action: "create",
              after: { name: input.name, buildingId: input.buildingId },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Creates equipment under a production line. */
export async function createEquipmentAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createEquipment",
      resource: "organization",
      action: "create",
      schema: equipmentInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const line = await prisma.productionLine.findUnique({
          where: { id: input.productionLineId },
          select: { building: { select: { facility: { select: { organizationId: true } } } } },
        });
        if (!line || line.building.facility.organizationId !== organizationId) {
          throw new NotFoundError(`Production line ${input.productionLineId} was not found`);
        }
        const created = await prisma.equipment.create({
          data: {
            productionLineId: input.productionLineId,
            name: input.name,
            code: input.code ?? null,
            type: input.type ?? null,
            manufacturer: input.manufacturer ?? null,
            model: input.model ?? null,
            serialNumber: input.serialNumber ?? null,
            installDate: input.installDate ?? null,
            efficiency: input.efficiency ?? null,
            fuelTypeId: input.fuelTypeId ?? null,
            refrigerantId: input.refrigerantId ?? null,
            isActive: input.isActive,
          },
        });
        return {
          data: { id: created.id },
          message: `Created equipment "${input.name}".`,
          messageKey: "action.success.createEquipment",
          audit: [
            auditEntry(session, {
              entityType: "Equipment",
              entityId: created.id,
              action: "create",
              after: { name: input.name, productionLineId: input.productionLineId },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Creates an emission source, the leaf of the hierarchy. */
export async function createEmissionSourceAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createEmissionSource",
      resource: "organization",
      action: "create",
      schema: emissionSourceInputSchema,
      revalidate: [...PATHS, "/activity-data"],
      attributes: (input) => ({ facilityId: input.facilityId ?? null, scope: input.scope }),
      handler: async ({ session, input, organizationId }) => {
        if (input.facilityId) {
          const facility = await prisma.facility.findUnique({
            where: { id: input.facilityId },
            select: { organizationId: true },
          });
          if (!facility || facility.organizationId !== organizationId) {
            throw new NotFoundError(`Facility ${input.facilityId} was not found`);
          }
        }
        const created = await prisma.emissionSource.create({
          data: {
            name: input.name,
            code: input.code ?? null,
            scope: input.scope,
            scope3Category: input.scope3Category ?? null,
            sourceType: input.sourceType ?? null,
            description: input.description ?? null,
            calculationApproach: input.calculationApproach,
            isActive: input.isActive,
            facilityId: input.facilityId ?? null,
            buildingId: input.buildingId ?? null,
            productionLineId: input.productionLineId ?? null,
            equipmentId: input.equipmentId ?? null,
          },
        });
        return {
          data: { id: created.id },
          message: `Created emission source "${input.name}".`,
          messageKey: "action.success.createEmissionSource",
          audit: [
            auditEntry(session, {
              entityType: "EmissionSource",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                scope: input.scope,
                scope3Category: input.scope3Category ?? null,
                sourceType: input.sourceType ?? null,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
