/**
 * Activity-data repository.
 *
 * `listCalculationEntries` is the important one: it projects persisted
 * `ActivityDataEntry` rows onto the `CalculationEntry` shape the orchestrator takes,
 * resolving the hierarchy and the factor-selection criteria from the entry's
 * emission source and master-data references. That projection is the *only* place
 * the mapping lives, so the demo fixtures and a real database drive the engines
 * through identical code.
 */

import type { CalculationApproach, GHGScope, Scope3Category } from "@/lib/core/enums";
import type {
  CalculationEntry,
  Scope1SourceType,
} from "@/lib/domain/emissions/orchestrator";
import type { ActivityDataQuery } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_ACTIVITY_DATA,
  DEMO_ACTIVITY_ENTRIES,
  DEMO_CALCULATION_ENTRIES,
  DEMO_ORGANIZATION_ID,
  DEMO_REPORTING_YEARS,
  FACTOR_SECTORS,
  REGION_APAC,
  REGION_GLOBAL,
  demoEntriesForYear,
  demoPeriodForYear,
  type DemoActivityData,
  type DemoActivityDataEntry,
} from "../demo";

export type ActivityDataRow = DemoActivityData & {
  readonly entryCount: number;
};

export type ActivityEntryRow = DemoActivityDataEntry & {
  readonly scope: GHGScope;
  readonly scope3Category: Scope3Category | null;
  readonly facilityId: string | null;
  readonly reportingYear: number;
};

/** Activity-data headers, for the entry table's grouping. */
export async function listActivityData(
  query: ActivityDataQuery,
): Promise<readonly ActivityDataRow[]> {
  return withDb(
    async () => {
      const rows = await prisma.activityData.findMany({
        where: {
          organizationId: query.organizationId,
          ...(query.facilityId ? { facilityId: query.facilityId } : {}),
          ...(query.businessUnitId ? { businessUnitId: query.businessUnitId } : {}),
          ...(query.scope ? { scope: query.scope } : {}),
          ...(query.scope3Category ? { scope3Category: query.scope3Category } : {}),
          ...(query.reportingYear ? { reportingYear: query.reportingYear } : {}),
        },
        orderBy: [{ reportingYear: "desc" }, { name: "asc" }],
        include: { _count: { select: { entries: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        facilityId: row.facilityId,
        businessUnitId: row.businessUnitId,
        name: row.name,
        description: row.description ?? "",
        scope: row.scope,
        scope3Category: row.scope3Category,
        reportingYear: row.reportingYear,
        reportingMonth: null,
        dataSource: row.dataSource,
        dataQuality: row.dataQuality,
        isVerified: row.isVerified,
        entryCount: row._count.entries,
      }));
    },
    () =>
      DEMO_ACTIVITY_DATA.filter(
        (row) =>
          row.organizationId === query.organizationId &&
          (!query.facilityId || row.facilityId === query.facilityId) &&
          (!query.businessUnitId || row.businessUnitId === query.businessUnitId) &&
          (!query.scope || row.scope === query.scope) &&
          (!query.scope3Category || row.scope3Category === query.scope3Category) &&
          (!query.reportingYear || row.reportingYear === query.reportingYear),
      ).map((row) => ({
        ...row,
        entryCount: DEMO_ACTIVITY_ENTRIES.filter((entry) => entry.activityDataId === row.id)
          .length,
      })),
  );
}

/** Entry rows for the table view. */
export async function listActivityEntries(
  query: ActivityDataQuery,
): Promise<readonly ActivityEntryRow[]> {
  return withDb(
    async () => {
      const rows = await prisma.activityDataEntry.findMany({
        where: {
          activityData: {
            organizationId: query.organizationId,
            ...(query.facilityId ? { facilityId: query.facilityId } : {}),
            ...(query.businessUnitId ? { businessUnitId: query.businessUnitId } : {}),
            ...(query.scope ? { scope: query.scope } : {}),
            ...(query.scope3Category ? { scope3Category: query.scope3Category } : {}),
            ...(query.reportingYear ? { reportingYear: query.reportingYear } : {}),
          },
          ...(query.from ? { startDate: { gte: query.from } } : {}),
          ...(query.to ? { endDate: { lte: query.to } } : {}),
        },
        orderBy: [{ startDate: "asc" }],
        include: {
          activityData: {
            select: {
              scope: true,
              scope3Category: true,
              facilityId: true,
              reportingYear: true,
            },
          },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        activityDataId: row.activityDataId,
        emissionSourceId: row.emissionSourceId ?? "",
        quantity: row.quantity,
        unit: row.unit,
        startDate: row.startDate,
        endDate: row.endDate,
        notes: row.notes ?? "",
        evidenceUrl: row.evidenceUrl,
        isEstimated: row.isEstimated,
        uncertainty: row.uncertainty ?? 0,
        productId: row.productId,
        supplierId: row.supplierId,
        vehicleId: row.vehicleId,
        fuelId: row.fuelId,
        refrigerantId: row.refrigerantId,
        rawMaterialId: row.rawMaterialId,
        logisticsRouteId: row.logisticsRouteId,
        energySourceId: row.energySourceId,
        wasteTypeId: row.wasteTypeId,
        waterSourceId: row.waterSourceId,
        scope: row.activityData.scope,
        scope3Category: row.activityData.scope3Category,
        facilityId: row.activityData.facilityId,
        reportingYear: row.activityData.reportingYear,
      }));
    },
    () => {
      const headers = new Map(DEMO_ACTIVITY_DATA.map((row) => [row.id, row]));
      return DEMO_ACTIVITY_ENTRIES.filter((entry) => {
        const header = headers.get(entry.activityDataId);
        if (!header) return false;
        if (header.organizationId !== query.organizationId) return false;
        if (query.facilityId && header.facilityId !== query.facilityId) return false;
        if (query.businessUnitId && header.businessUnitId !== query.businessUnitId) return false;
        if (query.scope && header.scope !== query.scope) return false;
        if (query.scope3Category && header.scope3Category !== query.scope3Category) return false;
        if (query.reportingYear && header.reportingYear !== query.reportingYear) return false;
        if (query.from && entry.startDate < query.from) return false;
        if (query.to && entry.endDate > query.to) return false;
        return true;
      }).map((entry) => {
        const header = headers.get(entry.activityDataId) as DemoActivityData;
        return {
          ...entry,
          scope: header.scope,
          scope3Category: header.scope3Category,
          facilityId: header.facilityId,
          reportingYear: header.reportingYear,
        };
      });
    },
  );
}

/**
 * Sector label used as the factor-selection criterion for an entry.
 *
 * `resolveFactor` treats `sector` as a hard filter, so a stationary diesel entry
 * must name the diesel *stationary* sector or it could match the LPG factor. The
 * mapping is driven by the emission source's `sourceType` plus the fuel it
 * references, which is exactly the information a real row carries.
 */
export function sectorForEntry(input: {
  readonly scope: GHGScope;
  readonly scope3Category: Scope3Category | null;
  readonly sourceType: string | null;
  readonly fuelName: string | null;
}): string | null {
  if (input.scope === "SCOPE_1") {
    const fuel = (input.fuelName ?? "").toLowerCase();
    const mobile = input.sourceType === "MOBILE";
    if (fuel.includes("natural gas") || fuel.includes("천연가스")) {
      return FACTOR_SECTORS.NATURAL_GAS_STATIONARY;
    }
    if (fuel.includes("diesel") || fuel.includes("경유")) {
      return mobile ? FACTOR_SECTORS.DIESEL_MOBILE : FACTOR_SECTORS.DIESEL_STATIONARY;
    }
    if (fuel.includes("gasoline") || fuel.includes("휘발유")) {
      return FACTOR_SECTORS.GASOLINE_MOBILE;
    }
    if (fuel.includes("lpg")) return FACTOR_SECTORS.LPG_STATIONARY;
    if (fuel.includes("fuel oil") || fuel.includes("중유")) {
      return FACTOR_SECTORS.FUEL_OIL_STATIONARY;
    }
    if (fuel.includes("anthracite") || fuel.includes("무연탄")) {
      return FACTOR_SECTORS.ANTHRACITE_STATIONARY;
    }
    return null;
  }
  if (input.scope === "SCOPE_3") {
    switch (input.scope3Category) {
      case "CAT_1_PURCHASED_GOODS":
        return FACTOR_SECTORS.POLYMER;
      case "CAT_3_FUEL_ENERGY":
        return FACTOR_SECTORS.ENERGY_UPSTREAM;
      case "CAT_4_UPSTREAM_TRANSPORT":
      case "CAT_9_DOWNSTREAM_TRANSPORT":
        return FACTOR_SECTORS.ROAD_FREIGHT;
      case "CAT_5_WASTE":
      case "CAT_12_END_OF_LIFE":
        return FACTOR_SECTORS.WASTE_TREATMENT;
      case "CAT_6_BUSINESS_TRAVEL":
        return FACTOR_SECTORS.AIR_TRAVEL;
      case "CAT_7_EMPLOYEE_COMMUTING":
        return FACTOR_SECTORS.COMMUTING_CAR;
      default:
        return null;
    }
  }
  return null;
}

/** Scope 1 engine selector derived from `EmissionSource.sourceType`. */
function scope1SourceTypeOf(sourceType: string | null): Scope1SourceType | undefined {
  switch (sourceType) {
    case "STATIONARY":
    case "MOBILE":
    case "PROCESS":
    case "FUGITIVE":
      return sourceType;
    default:
      return undefined;
  }
}

/**
 * Projects persisted entries onto the orchestrator input for one reporting year.
 * In demo mode this returns the pre-projected fixture entries, which are produced
 * by the same rules.
 */
export async function listCalculationEntries(
  organizationId: string,
  reportingYear: number,
  options: { readonly facilityIds?: readonly string[]; readonly scopes?: readonly GHGScope[] } = {},
): Promise<readonly CalculationEntry[]> {
  const entries = await withDb(
    async () => {
      const rows = await prisma.activityDataEntry.findMany({
        where: {
          activityData: { organizationId, reportingYear },
        },
        orderBy: [{ startDate: "asc" }],
        include: {
          activityData: {
            select: {
              scope: true,
              scope3Category: true,
              facilityId: true,
              businessUnitId: true,
            },
          },
          emissionSource: {
            select: {
              id: true,
              sourceType: true,
              calculationApproach: true,
              facilityId: true,
              buildingId: true,
              productionLineId: true,
              equipmentId: true,
              facility: {
                select: { businessUnitId: true, country: true },
              },
            },
          },
          fuel: { select: { name: true } },
          refrigerant: { select: { name: true } },
          supplier: { select: { id: true, country: true } },
        },
      });

      return rows.map((row): CalculationEntry => {
        const scope = row.activityData.scope;
        const scope3Category = row.activityData.scope3Category;
        const sourceType = row.emissionSource?.sourceType ?? null;
        const sector = sectorForEntry({
          scope,
          scope3Category,
          sourceType,
          fuelName: row.fuel?.name ?? null,
        });
        const isElectricity = scope === "SCOPE_2_LOCATION" || scope === "SCOPE_2_MARKET";
        const country =
          isElectricity || scope3Category === "CAT_1_PURCHASED_GOODS"
            ? (row.supplier?.country ?? row.emissionSource?.facility?.country ?? null)
            : null;

        return {
          id: row.id,
          name: row.notes ?? row.id,
          quantity: row.quantity,
          unit: row.unit,
          dataPeriod: { start: row.startDate, end: row.endDate },
          scope,
          scope3Category,
          scope1SourceType: scope1SourceTypeOf(sourceType),
          approach: (row.emissionSource?.calculationApproach ??
            "ACTIVITY_BASED") as CalculationApproach,
          region: isElectricity || scope3Category === "CAT_1_PURCHASED_GOODS"
            ? REGION_APAC
            : REGION_GLOBAL,
          country,
          sector,
          supplierId: row.supplierId,
          businessUnitId:
            row.emissionSource?.facility?.businessUnitId ?? row.activityData.businessUnitId,
          facilityId: row.emissionSource?.facilityId ?? row.activityData.facilityId,
          buildingId: row.emissionSource?.buildingId ?? null,
          productionLineId: row.emissionSource?.productionLineId ?? null,
          equipmentId: row.emissionSource?.equipmentId ?? null,
          emissionSourceId: row.emissionSourceId,
          mobileMethod: sourceType === "MOBILE" ? "FUEL" : undefined,
          fugitive:
            sourceType === "FUGITIVE"
              ? {
                  method: "SCREENING",
                  blend: row.refrigerant?.name,
                  inventoryChange: 0,
                  purchases: row.quantity,
                  disposals: 0,
                }
              : undefined,
          isEstimated: row.isEstimated,
          hasEvidence: row.evidenceUrl !== null,
          unitConsistent: true,
          activityDataUncertainty: (row.uncertainty ?? 0) * 100,
        };
      });
    },
    () => demoEntriesForYear(reportingYear),
  );

  return entries.filter((entry) => {
    if (options.facilityIds && options.facilityIds.length > 0) {
      if (!entry.facilityId || !options.facilityIds.includes(entry.facilityId)) return false;
    }
    if (options.scopes && options.scopes.length > 0) {
      if (!options.scopes.includes(entry.scope)) return false;
    }
    return true;
  });
}

/** Reporting years that actually carry activity data. */
export async function listReportingYears(
  organizationId: string,
): Promise<readonly number[]> {
  return withDb(
    async () => {
      const rows = await prisma.activityData.findMany({
        where: { organizationId },
        distinct: ["reportingYear"],
        select: { reportingYear: true },
        orderBy: { reportingYear: "desc" },
      });
      return rows.map((row) => row.reportingYear);
    },
    () => [...DEMO_REPORTING_YEARS].reverse(),
  );
}

export { demoPeriodForYear as reportingPeriodForYear };

/** All fixture entries, for tests and the seed-parity check. */
export function allDemoCalculationEntries(): readonly CalculationEntry[] {
  return DEMO_CALCULATION_ENTRIES;
}

export const DEFAULT_DEMO_ORGANIZATION_ID = DEMO_ORGANIZATION_ID;
