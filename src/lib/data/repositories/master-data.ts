/**
 * Master-data repository: the reference entities activity entries point at.
 *
 * The master-data page renders ten tabs off one read, so this repository exposes a
 * single `getMasterData` that fetches everything in one `Promise.all` rather than
 * ten round trips, plus per-collection readers for the forms.
 */

import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_ENERGY_SOURCES,
  DEMO_FUELS,
  DEMO_FUEL_TYPES,
  DEMO_LOGISTICS_ROUTES,
  DEMO_PRODUCTS,
  DEMO_RAW_MATERIALS,
  DEMO_REFRIGERANTS,
  DEMO_SUPPLIERS,
  DEMO_VEHICLES,
  DEMO_WASTE_TYPES,
  DEMO_WATER_SOURCES,
} from "../demo";

export type MasterDataBundle = {
  readonly fuelTypes: readonly (typeof DEMO_FUEL_TYPES)[number][];
  readonly fuels: readonly (typeof DEMO_FUELS)[number][];
  readonly vehicles: readonly (typeof DEMO_VEHICLES)[number][];
  readonly refrigerants: readonly (typeof DEMO_REFRIGERANTS)[number][];
  readonly suppliers: readonly (typeof DEMO_SUPPLIERS)[number][];
  readonly products: readonly (typeof DEMO_PRODUCTS)[number][];
  readonly rawMaterials: readonly (typeof DEMO_RAW_MATERIALS)[number][];
  readonly logisticsRoutes: readonly (typeof DEMO_LOGISTICS_ROUTES)[number][];
  readonly energySources: readonly (typeof DEMO_ENERGY_SOURCES)[number][];
  readonly wasteTypes: readonly (typeof DEMO_WASTE_TYPES)[number][];
  readonly waterSources: readonly (typeof DEMO_WATER_SOURCES)[number][];
};

function demoBundle(organizationId: string): MasterDataBundle {
  return {
    fuelTypes: [...DEMO_FUEL_TYPES],
    fuels: [...DEMO_FUELS],
    vehicles: [...DEMO_VEHICLES],
    refrigerants: [...DEMO_REFRIGERANTS],
    suppliers: DEMO_SUPPLIERS.filter((supplier) => supplier.organizationId === organizationId),
    products: DEMO_PRODUCTS.filter((product) => product.organizationId === organizationId),
    rawMaterials: [...DEMO_RAW_MATERIALS],
    logisticsRoutes: [...DEMO_LOGISTICS_ROUTES],
    energySources: [...DEMO_ENERGY_SOURCES],
    wasteTypes: [...DEMO_WASTE_TYPES],
    waterSources: [...DEMO_WATER_SOURCES],
  };
}

/** Everything the master-data page needs, in one round trip. */
export async function getMasterData(organizationId: string): Promise<MasterDataBundle> {
  return withDb(
    async () => {
      const [
        fuelTypes,
        fuels,
        vehicles,
        refrigerants,
        suppliers,
        products,
        rawMaterials,
        logisticsRoutes,
        energySources,
        wasteTypes,
        waterSources,
      ] = await Promise.all([
        prisma.fuelType.findMany({ orderBy: { name: "asc" } }),
        prisma.fuel.findMany({ orderBy: { name: "asc" } }),
        prisma.vehicle.findMany({ orderBy: { name: "asc" } }),
        prisma.refrigerant.findMany({ orderBy: { name: "asc" } }),
        prisma.supplier.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
        prisma.product.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
        prisma.rawMaterial.findMany({ orderBy: { name: "asc" } }),
        prisma.logisticsRoute.findMany({ orderBy: { name: "asc" } }),
        prisma.energySource.findMany({ orderBy: { name: "asc" } }),
        prisma.wasteType.findMany({ orderBy: { name: "asc" } }),
        prisma.waterSource.findMany({ orderBy: { name: "asc" } }),
      ]);

      return {
        fuelTypes: fuelTypes.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          description: row.description ?? "",
        })),
        fuels: fuels.map((row) => ({
          id: row.id,
          name: row.name,
          fuelTypeId: row.fuelTypeId,
          unit: row.unit,
          netCalorific: row.netCalorific ?? 0,
          grossCalorific: row.grossCalorific ?? 0,
          density: row.density,
          carbonContent: row.carbonContent ?? 0,
          isRenewable: row.isRenewable,
        })),
        vehicles: vehicles.map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type,
          fuelType: row.fuelType ?? "",
          make: row.make ?? "",
          model: row.model ?? "",
          year: row.year ?? 0,
          efficiency: row.efficiency ?? 0,
          efficiencyUnit: row.efficiencyUnit ?? "",
          isOwned: row.isOwned,
        })),
        refrigerants: refrigerants.map((row) => ({
          id: row.id,
          name: row.name,
          chemicalFormula: row.chemicalFormula ?? "",
          gwp100: row.gwp100,
          ozoneDepletionPotential: row.ozoneDepletionPotential ?? 0,
          category: row.category ?? "",
        })),
        suppliers: suppliers.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          name: row.name,
          code: row.code ?? "",
          category: row.category ?? "",
          country: row.country ?? "",
          contactEmail: row.contactEmail ?? "",
          tier: row.tier,
          sustainabilityRating: row.sustainabilityRating ?? "",
          isActive: row.isActive,
        })),
        products: products.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          name: row.name,
          sku: row.sku ?? "",
          category: row.category ?? "",
          unit: row.unit ?? "",
          weight: row.weight ?? 0,
          weightUnit: row.weightUnit ?? "",
          lifecycleStage: row.lifecycleStage ?? "",
          isActive: row.isActive,
        })),
        rawMaterials: rawMaterials.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category ?? "",
          unit: row.unit ?? "",
          emissionIntensity: row.emissionIntensity ?? 0,
          sourceRegion: row.sourceRegion ?? "",
          isRecycled: row.isRecycled,
          recycledContent: row.recycledContent ?? 0,
        })),
        logisticsRoutes: logisticsRoutes.map((row) => ({
          id: row.id,
          name: row.name,
          origin: row.origin,
          destination: row.destination,
          distance: row.distance,
          distanceUnit: row.distanceUnit,
          transportMode: row.transportMode,
          isReturn: row.isReturn,
        })),
        energySources: energySources.map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type,
          provider: row.provider ?? "",
          gridRegion: row.gridRegion ?? "",
          renewablePercent: row.renewablePercent ?? 0,
          contractType: row.contractType ?? "",
        })),
        wasteTypes: wasteTypes.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category ?? "",
          disposalMethod: row.disposalMethod ?? "",
          isHazardous: row.isHazardous,
          recyclingRate: row.recyclingRate ?? 0,
        })),
        waterSources: waterSources.map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type ?? "",
          source: row.source ?? "",
          treatment: row.treatment ?? "",
          isRecycled: row.isRecycled,
        })),
      } satisfies MasterDataBundle;
    },
    () => demoBundle(organizationId),
  );
}

export async function listSuppliers(organizationId: string) {
  return (await getMasterData(organizationId)).suppliers;
}

export async function listFuels(organizationId: string) {
  return (await getMasterData(organizationId)).fuels;
}

export async function listRefrigerants(organizationId: string) {
  return (await getMasterData(organizationId)).refrigerants;
}
