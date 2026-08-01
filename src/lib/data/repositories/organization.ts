/**
 * Organisation hierarchy repository.
 *
 * Reads go through `withDb`, so every function returns the demo fixture when no
 * database is reachable. The hierarchy tree is assembled here rather than in a
 * page component, because the seven-level shape is needed identically by the
 * organisation page, the roll-up views and the calculation actions.
 */

import type { GHGScope, OrganizationTier } from "@/lib/core/enums";
import type { FacilityConsolidationLike } from "@/lib/domain/emissions/aggregate";
import type { EmissionSourceLike } from "@/lib/domain/mrv/plan";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_BUILDINGS,
  DEMO_BUSINESS_UNITS,
  DEMO_EMISSION_SOURCES,
  DEMO_EQUIPMENT,
  DEMO_FACILITIES,
  DEMO_FACILITY_CONSOLIDATION,
  DEMO_ORGANIZATION,
  DEMO_ORGANIZATION_ID,
  DEMO_PRODUCTION_LINES,
  DEMO_SOURCE_HIERARCHY,
  DEMO_USERS,
  type SourceHierarchy,
} from "../demo";

export type OrganizationSummary = {
  readonly id: string;
  readonly name: string;
  readonly legalName: string | null;
  readonly industry: string | null;
  readonly sector: string | null;
  readonly country: string | null;
  readonly region: string | null;
  readonly fiscalYearStart: number;
  readonly baseCurrency: string;
  readonly reportingYear: number | null;
  readonly isActive: boolean;
};

export type FacilitySummary = {
  readonly id: string;
  readonly organizationId: string;
  readonly businessUnitId: string | null;
  readonly name: string;
  readonly code: string | null;
  readonly type: string | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly area: number | null;
  readonly areaUnit: string | null;
  readonly operationalControl: boolean;
  readonly equityShare: number | null;
  readonly isActive: boolean;
};

export type HierarchyNode = {
  readonly id: string;
  readonly name: string;
  readonly tier: OrganizationTier;
  readonly code: string | null;
  readonly children: readonly HierarchyNode[];
  /** Extra attributes the UI renders in the node detail panel. */
  readonly attributes: Readonly<Record<string, string | number | boolean | null>>;
};

function demoOrganization(): OrganizationSummary {
  return {
    id: DEMO_ORGANIZATION.id,
    name: DEMO_ORGANIZATION.name,
    legalName: DEMO_ORGANIZATION.legalName,
    industry: DEMO_ORGANIZATION.industry,
    sector: DEMO_ORGANIZATION.sector,
    country: DEMO_ORGANIZATION.country,
    region: DEMO_ORGANIZATION.region,
    fiscalYearStart: DEMO_ORGANIZATION.fiscalYearStart,
    baseCurrency: DEMO_ORGANIZATION.baseCurrency,
    reportingYear: DEMO_ORGANIZATION.reportingYear,
    isActive: DEMO_ORGANIZATION.isActive,
  };
}

/**
 * Every organisation the deployment knows about.
 *
 * Deployment-wide, so it is **not** what the organisation switcher or the active
 * organisation cookie may be validated against — use `listOrganizationsForUser`
 * for anything a session can influence. This remains for
 * `getDefaultOrganizationId()`, which answers "which tenant does a fresh
 * deployment start on?" and is not a per-user question.
 */
export async function listOrganizations(): Promise<readonly OrganizationSummary[]> {
  return withDb(
    async () => {
      const rows = await prisma.organization.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        legalName: row.legalName,
        industry: row.industry,
        sector: row.sector,
        country: row.country,
        region: row.region,
        fiscalYearStart: row.fiscalYearStart,
        baseCurrency: row.baseCurrency,
        reportingYear: row.reportingYear,
        isActive: row.isActive,
      }));
    },
    () => [demoOrganization()],
  );
}

/**
 * Active organisations the given user is a member of.
 *
 * The membership join is in the `where` clause rather than applied afterwards, so
 * the database never returns a row the caller then has to remember to filter. This
 * is the only list a signed-in user's tenant selection is validated against.
 */
export async function listOrganizationsForUser(
  userId: string,
): Promise<readonly OrganizationSummary[]> {
  return withDb(
    async () => {
      const rows = await prisma.organization.findMany({
        where: { isActive: true, users: { some: { id: userId, isActive: true } } },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        legalName: row.legalName,
        industry: row.industry,
        sector: row.sector,
        country: row.country,
        region: row.region,
        fiscalYearStart: row.fiscalYearStart,
        baseCurrency: row.baseCurrency,
        reportingYear: row.reportingYear,
        isActive: row.isActive,
      }));
    },
    () =>
      DEMO_USERS.some(
        (user) => user.id === userId && user.organizationId === DEMO_ORGANIZATION_ID,
      )
        ? [demoOrganization()]
        : [],
  );
}

export async function getOrganization(
  organizationId: string,
): Promise<OrganizationSummary | null> {
  return withDb(
    async () => {
      const row = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        legalName: row.legalName,
        industry: row.industry,
        sector: row.sector,
        country: row.country,
        region: row.region,
        fiscalYearStart: row.fiscalYearStart,
        baseCurrency: row.baseCurrency,
        reportingYear: row.reportingYear,
        isActive: row.isActive,
      };
    },
    () => (organizationId === DEMO_ORGANIZATION_ID ? demoOrganization() : null),
  );
}

/** Default organisation for a session with no explicit selection. */
export async function getDefaultOrganizationId(): Promise<string> {
  const organizations = await listOrganizations();
  return organizations[0]?.id ?? DEMO_ORGANIZATION_ID;
}

export async function listFacilities(
  organizationId: string,
): Promise<readonly FacilitySummary[]> {
  return withDb(
    async () => {
      const rows = await prisma.facility.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        businessUnitId: row.businessUnitId,
        name: row.name,
        code: row.code,
        type: row.type,
        city: row.city,
        country: row.country,
        latitude: row.latitude,
        longitude: row.longitude,
        area: row.area,
        areaUnit: row.areaUnit,
        operationalControl: row.operationalControl,
        equityShare: row.equityShare,
        isActive: row.isActive,
      }));
    },
    () => DEMO_FACILITIES.filter((facility) => facility.organizationId === organizationId),
  );
}

/** Shape `applyConsolidation` needs; kept separate so callers cannot forget it. */
export async function listFacilityConsolidation(
  organizationId: string,
): Promise<readonly FacilityConsolidationLike[]> {
  const facilities = await listFacilities(organizationId);
  if (facilities.length === 0 && organizationId === DEMO_ORGANIZATION_ID) {
    return DEMO_FACILITY_CONSOLIDATION;
  }
  return facilities.map((facility) => ({
    id: facility.id,
    operationalControl: facility.operationalControl,
    equityShare: facility.equityShare ?? 100,
  }));
}

export async function listEmissionSources(
  organizationId: string,
  options: { readonly scope?: GHGScope } = {},
): Promise<readonly EmissionSourceLike[]> {
  return withDb(
    async () => {
      const rows = await prisma.emissionSource.findMany({
        where: {
          facility: { organizationId },
          ...(options.scope ? { scope: options.scope } : {}),
        },
        orderBy: [{ scope: "asc" }, { name: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        scope: row.scope,
        scope3Category: row.scope3Category,
        sourceType: row.sourceType,
        isActive: row.isActive,
        facilityId: row.facilityId,
      }));
    },
    () =>
      DEMO_EMISSION_SOURCES.filter(
        (source) => !options.scope || source.scope === options.scope,
      ).map((source) => ({
        id: source.id,
        name: source.name,
        code: source.code,
        scope: source.scope,
        scope3Category: source.scope3Category,
        sourceType: source.sourceType,
        isActive: source.isActive,
        facilityId: source.facilityId,
      })),
  );
}

/**
 * Hierarchy path per emission source, denormalised for the aggregation engine.
 * `EmissionResultLike` needs the deeper levels that `EmissionResult` does not
 * store, so this is resolved once and reused.
 */
export async function getSourceHierarchy(
  organizationId: string,
): Promise<Readonly<Record<string, SourceHierarchy>>> {
  return withDb(
    async () => {
      const rows = await prisma.emissionSource.findMany({
        where: { facility: { organizationId } },
        select: {
          id: true,
          facilityId: true,
          buildingId: true,
          productionLineId: true,
          equipmentId: true,
          facility: { select: { businessUnitId: true } },
        },
      });
      return Object.fromEntries(
        rows.map((row) => [
          row.id,
          {
            organizationId,
            businessUnitId: row.facility?.businessUnitId ?? null,
            facilityId: row.facilityId,
            buildingId: row.buildingId,
            productionLineId: row.productionLineId,
            equipmentId: row.equipmentId,
            emissionSourceId: row.id,
          } satisfies SourceHierarchy,
        ]),
      );
    },
    () => DEMO_SOURCE_HIERARCHY,
  );
}

/** The full seven-level tree, ready for the organisation page. */
export async function getHierarchyTree(organizationId: string): Promise<HierarchyNode | null> {
  return withDb(
    async () => {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        include: {
          businessUnits: { orderBy: { name: "asc" } },
          facilities: {
            orderBy: { name: "asc" },
            include: {
              buildings: {
                orderBy: { name: "asc" },
                include: {
                  productionLines: {
                    orderBy: { name: "asc" },
                    include: {
                      equipment: {
                        orderBy: { name: "asc" },
                        include: { emissionSources: { orderBy: { name: "asc" } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!organization) return null;
      return buildTree({
        organization: {
          id: organization.id,
          name: organization.name,
          country: organization.country,
          baseCurrency: organization.baseCurrency,
        },
        businessUnits: organization.businessUnits.map((unit) => ({
          id: unit.id,
          name: unit.name,
          code: unit.code,
          tier: unit.tier,
        })),
        facilities: organization.facilities.map((facility) => ({
          id: facility.id,
          businessUnitId: facility.businessUnitId,
          name: facility.name,
          code: facility.code,
          city: facility.city,
          operationalControl: facility.operationalControl,
          equityShare: facility.equityShare,
        })),
        buildings: organization.facilities.flatMap((facility) =>
          facility.buildings.map((building) => ({
            id: building.id,
            facilityId: facility.id,
            name: building.name,
            code: building.code,
            area: building.area,
          })),
        ),
        productionLines: organization.facilities.flatMap((facility) =>
          facility.buildings.flatMap((building) =>
            building.productionLines.map((line) => ({
              id: line.id,
              buildingId: building.id,
              name: line.name,
              code: line.code,
              capacity: line.capacity,
            })),
          ),
        ),
        equipment: organization.facilities.flatMap((facility) =>
          facility.buildings.flatMap((building) =>
            building.productionLines.flatMap((line) =>
              line.equipment.map((item) => ({
                id: item.id,
                productionLineId: line.id,
                name: item.name,
                code: item.code,
                type: item.type,
              })),
            ),
          ),
        ),
        emissionSources: organization.facilities.flatMap((facility) =>
          facility.buildings.flatMap((building) =>
            building.productionLines.flatMap((line) =>
              line.equipment.flatMap((item) =>
                item.emissionSources.map((source) => ({
                  id: source.id,
                  equipmentId: item.id,
                  name: source.name,
                  code: source.code,
                  scope: source.scope,
                })),
              ),
            ),
          ),
        ),
      });
    },
    () =>
      organizationId === DEMO_ORGANIZATION_ID
        ? buildTree({
            organization: {
              id: DEMO_ORGANIZATION.id,
              name: DEMO_ORGANIZATION.name,
              country: DEMO_ORGANIZATION.country,
              baseCurrency: DEMO_ORGANIZATION.baseCurrency,
            },
            businessUnits: DEMO_BUSINESS_UNITS.map((unit) => ({
              id: unit.id,
              name: unit.name,
              code: unit.code,
              tier: unit.tier,
            })),
            facilities: DEMO_FACILITIES.map((facility) => ({
              id: facility.id,
              businessUnitId: facility.businessUnitId,
              name: facility.name,
              code: facility.code,
              city: facility.city,
              operationalControl: facility.operationalControl,
              equityShare: facility.equityShare,
            })),
            buildings: DEMO_BUILDINGS.map((building) => ({
              id: building.id,
              facilityId: building.facilityId,
              name: building.name,
              code: building.code,
              area: building.area,
            })),
            productionLines: DEMO_PRODUCTION_LINES.map((line) => ({
              id: line.id,
              buildingId: line.buildingId,
              name: line.name,
              code: line.code,
              capacity: line.capacity,
            })),
            equipment: DEMO_EQUIPMENT.map((item) => ({
              id: item.id,
              productionLineId: item.productionLineId,
              name: item.name,
              code: item.code,
              type: item.type,
            })),
            emissionSources: DEMO_EMISSION_SOURCES.filter(
              (source) => source.equipmentId !== null,
            ).map((source) => ({
              id: source.id,
              equipmentId: source.equipmentId as string,
              name: source.name,
              code: source.code,
              scope: source.scope,
            })),
          })
        : null,
  );
}

type TreeInput = {
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly country: string | null;
    readonly baseCurrency: string;
  };
  readonly businessUnits: readonly {
    readonly id: string;
    readonly name: string;
    readonly code: string | null;
    readonly tier: OrganizationTier;
  }[];
  readonly facilities: readonly {
    readonly id: string;
    readonly businessUnitId: string | null;
    readonly name: string;
    readonly code: string | null;
    readonly city: string | null;
    readonly operationalControl: boolean;
    readonly equityShare: number | null;
  }[];
  readonly buildings: readonly {
    readonly id: string;
    readonly facilityId: string;
    readonly name: string;
    readonly code: string | null;
    readonly area: number | null;
  }[];
  readonly productionLines: readonly {
    readonly id: string;
    readonly buildingId: string;
    readonly name: string;
    readonly code: string | null;
    readonly capacity: number | null;
  }[];
  readonly equipment: readonly {
    readonly id: string;
    readonly productionLineId: string;
    readonly name: string;
    readonly code: string | null;
    readonly type: string | null;
  }[];
  readonly emissionSources: readonly {
    readonly id: string;
    readonly equipmentId: string;
    readonly name: string;
    readonly code: string | null;
    readonly scope: GHGScope;
  }[];
};

function buildTree(input: TreeInput): HierarchyNode {
  const sourcesByEquipment = groupBy(input.emissionSources, (source) => source.equipmentId);
  const equipmentByLine = groupBy(input.equipment, (item) => item.productionLineId);
  const linesByBuilding = groupBy(input.productionLines, (line) => line.buildingId);
  const buildingsByFacility = groupBy(input.buildings, (building) => building.facilityId);
  const facilitiesByUnit = groupBy(
    input.facilities,
    (facility) => facility.businessUnitId ?? "__unassigned__",
  );

  const facilityNode = (facility: TreeInput["facilities"][number]): HierarchyNode => ({
    id: facility.id,
    name: facility.name,
    tier: "FACILITY",
    code: facility.code,
    attributes: {
      city: facility.city,
      operationalControl: facility.operationalControl,
      equityShare: facility.equityShare,
    },
    children: (buildingsByFacility.get(facility.id) ?? []).map((building) => ({
      id: building.id,
      name: building.name,
      tier: "BUILDING" as OrganizationTier,
      code: building.code,
      attributes: { area: building.area },
      children: (linesByBuilding.get(building.id) ?? []).map((line) => ({
        id: line.id,
        name: line.name,
        tier: "PRODUCTION_LINE" as OrganizationTier,
        code: line.code,
        attributes: { capacity: line.capacity },
        children: (equipmentByLine.get(line.id) ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          tier: "EQUIPMENT" as OrganizationTier,
          code: item.code,
          attributes: { type: item.type },
          children: (sourcesByEquipment.get(item.id) ?? []).map((source) => ({
            id: source.id,
            name: source.name,
            tier: "SOURCE" as OrganizationTier,
            code: source.code,
            attributes: { scope: source.scope },
            children: [],
          })),
        })),
      })),
    })),
  });

  return {
    id: input.organization.id,
    name: input.organization.name,
    tier: "ENTERPRISE",
    code: null,
    attributes: {
      country: input.organization.country,
      baseCurrency: input.organization.baseCurrency,
    },
    children: [
      ...input.businessUnits.map((unit) => ({
        id: unit.id,
        name: unit.name,
        tier: unit.tier,
        code: unit.code,
        attributes: {},
        children: (facilitiesByUnit.get(unit.id) ?? []).map(facilityNode),
      })),
      ...(facilitiesByUnit.get("__unassigned__") ?? []).map(facilityNode),
    ],
  };
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const group = map.get(key(item));
    if (group) group.push(item);
    else map.set(key(item), [item]);
  }
  return map;
}
