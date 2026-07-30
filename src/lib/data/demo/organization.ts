/**
 * Demo tenant: the seven-level organisational hierarchy.
 *
 * One organisation, 2 business units, 3 facilities, 4 buildings, 4 production
 * lines, 5 pieces of equipment and 13 emission sources. Ids are readable slugs
 * rather than cuids so the same graph can be asserted in tests, seeded into a
 * real database (item 32) and rendered by the UI without a translation step.
 *
 * Pyeongtaek is deliberately a 60 %-owned joint venture with no operational
 * control, so the equity-share and financial-control consolidation paths in
 * `applyConsolidation` are exercised by the demo data itself.
 */

import type {
  CalculationApproach,
  GHGScope,
  OrganizationTier,
  Scope3Category,
} from "@/lib/core/enums";
import type { FacilityConsolidationLike } from "@/lib/domain/emissions/aggregate";

export const DEMO_ORGANIZATION_ID = "demo-org-hanbit";

export type DemoOrganization = {
  readonly id: string;
  readonly name: string;
  readonly legalName: string;
  readonly industry: string;
  readonly sector: string;
  readonly country: string;
  readonly region: string;
  readonly address: string;
  readonly website: string;
  readonly fiscalYearStart: number;
  readonly baseCurrency: string;
  readonly reportingYear: number;
  readonly isActive: boolean;
};

export const DEMO_ORGANIZATION: DemoOrganization = {
  id: DEMO_ORGANIZATION_ID,
  name: "한빛소재 (Hanbit Materials)",
  legalName: "Hanbit Materials Co., Ltd.",
  industry: "Chemicals & Advanced Materials",
  sector: "Manufacturing",
  country: "KR",
  region: "Asia-Pacific",
  address: "27 Sandan-ro, Nam-gu, Ulsan, Republic of Korea",
  website: "https://example.com/hanbit-materials",
  fiscalYearStart: 1,
  baseCurrency: "KRW",
  reportingYear: 2024,
  isActive: true,
};

export type DemoBusinessUnit = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly code: string;
  readonly description: string;
  readonly tier: OrganizationTier;
  readonly isActive: boolean;
};

export const DEMO_BUSINESS_UNITS: readonly DemoBusinessUnit[] = [
  {
    id: "demo-bu-materials",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "소재사업부 (Materials Division)",
    code: "MAT",
    description: "Polymer compounding and film extrusion.",
    tier: "BUSINESS_UNIT",
    isActive: true,
  },
  {
    id: "demo-bu-logistics",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "물류사업부 (Logistics Division)",
    code: "LOG",
    description: "Domestic distribution and export packing.",
    tier: "BUSINESS_UNIT",
    isActive: true,
  },
];

export type DemoFacility = {
  readonly id: string;
  readonly organizationId: string;
  readonly businessUnitId: string;
  readonly name: string;
  readonly code: string;
  readonly type: string;
  readonly city: string;
  readonly country: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly area: number;
  readonly areaUnit: string;
  readonly operationalControl: boolean;
  /** Percentage, matching `Facility.equityShare`. */
  readonly equityShare: number;
  readonly isActive: boolean;
};

export const DEMO_FACILITIES: readonly DemoFacility[] = [
  {
    id: "demo-fac-ulsan",
    organizationId: DEMO_ORGANIZATION_ID,
    businessUnitId: "demo-bu-materials",
    name: "울산공장 (Ulsan Plant)",
    code: "ULS",
    type: "Manufacturing plant",
    city: "Ulsan",
    country: "KR",
    latitude: 35.5384,
    longitude: 129.3114,
    area: 85_000,
    areaUnit: "sqm",
    operationalControl: true,
    equityShare: 100,
    isActive: true,
  },
  {
    id: "demo-fac-pyeongtaek",
    organizationId: DEMO_ORGANIZATION_ID,
    businessUnitId: "demo-bu-materials",
    name: "평택합작공장 (Pyeongtaek JV Plant)",
    code: "PYT",
    type: "Joint-venture plant",
    city: "Pyeongtaek",
    country: "KR",
    latitude: 36.9921,
    longitude: 127.1128,
    area: 41_500,
    areaUnit: "sqm",
    // 60 % owned, operated by the JV partner: excluded under operational control,
    // included at 60 % under equity share.
    operationalControl: false,
    equityShare: 60,
    isActive: true,
  },
  {
    id: "demo-fac-incheon",
    organizationId: DEMO_ORGANIZATION_ID,
    businessUnitId: "demo-bu-logistics",
    name: "인천물류센터 (Incheon Distribution Centre)",
    code: "ICN",
    type: "Distribution centre",
    city: "Incheon",
    country: "KR",
    latitude: 37.4563,
    longitude: 126.7052,
    area: 23_800,
    areaUnit: "sqm",
    operationalControl: true,
    equityShare: 100,
    isActive: true,
  },
];

/** Shape `applyConsolidation` consumes. */
export const DEMO_FACILITY_CONSOLIDATION: readonly FacilityConsolidationLike[] =
  DEMO_FACILITIES.map((facility) => ({
    id: facility.id,
    operationalControl: facility.operationalControl,
    equityShare: facility.equityShare,
  }));

export type DemoBuilding = {
  readonly id: string;
  readonly facilityId: string;
  readonly name: string;
  readonly code: string;
  readonly type: string;
  readonly floors: number;
  readonly area: number;
  readonly areaUnit: string;
  readonly yearBuilt: number;
  readonly energyRating: string;
  readonly isActive: boolean;
};

export const DEMO_BUILDINGS: readonly DemoBuilding[] = [
  {
    id: "demo-bld-ulsan-a",
    facilityId: "demo-fac-ulsan",
    name: "울산 A동 생산건물 (Ulsan Production Building A)",
    code: "ULS-A",
    type: "Production",
    floors: 3,
    area: 28_400,
    areaUnit: "sqm",
    yearBuilt: 2004,
    energyRating: "B",
    isActive: true,
  },
  {
    id: "demo-bld-ulsan-util",
    facilityId: "demo-fac-ulsan",
    name: "울산 유틸리티동 (Ulsan Utility Building)",
    code: "ULS-U",
    type: "Utility",
    floors: 2,
    area: 6_100,
    areaUnit: "sqm",
    yearBuilt: 2011,
    energyRating: "A",
    isActive: true,
  },
  {
    id: "demo-bld-pyeongtaek-a",
    facilityId: "demo-fac-pyeongtaek",
    name: "평택 생산건물 (Pyeongtaek Production Building)",
    code: "PYT-A",
    type: "Production",
    floors: 2,
    area: 19_700,
    areaUnit: "sqm",
    yearBuilt: 2017,
    energyRating: "A",
    isActive: true,
  },
  {
    id: "demo-bld-incheon-wh",
    facilityId: "demo-fac-incheon",
    name: "인천 물류창고 (Incheon Warehouse)",
    code: "ICN-W",
    type: "Warehouse",
    floors: 1,
    area: 18_900,
    areaUnit: "sqm",
    yearBuilt: 2019,
    energyRating: "A",
    isActive: true,
  },
];

export type DemoProductionLine = {
  readonly id: string;
  readonly buildingId: string;
  readonly name: string;
  readonly code: string;
  readonly type: string;
  readonly capacity: number;
  readonly capacityUnit: string;
  readonly isActive: boolean;
};

export const DEMO_PRODUCTION_LINES: readonly DemoProductionLine[] = [
  {
    id: "demo-line-ulsan-1",
    buildingId: "demo-bld-ulsan-a",
    name: "컴파운딩 1라인 (Compounding Line 1)",
    code: "ULS-A-L1",
    type: "Compounding",
    capacity: 18_000,
    capacityUnit: "t",
    isActive: true,
  },
  {
    id: "demo-line-ulsan-2",
    buildingId: "demo-bld-ulsan-a",
    name: "컴파운딩 2라인 (Compounding Line 2)",
    code: "ULS-A-L2",
    type: "Compounding",
    capacity: 12_000,
    capacityUnit: "t",
    isActive: true,
  },
  {
    id: "demo-line-pyeongtaek-1",
    buildingId: "demo-bld-pyeongtaek-a",
    name: "필름 1라인 (Film Line 1)",
    code: "PYT-A-L1",
    type: "Film extrusion",
    capacity: 9_400,
    capacityUnit: "t",
    isActive: true,
  },
  {
    id: "demo-line-incheon-pack",
    buildingId: "demo-bld-incheon-wh",
    name: "출하 포장라인 (Packing Line)",
    code: "ICN-W-L1",
    type: "Packing",
    capacity: 26_000,
    capacityUnit: "t",
    isActive: true,
  },
];

export type DemoEquipment = {
  readonly id: string;
  readonly productionLineId: string;
  readonly name: string;
  readonly code: string;
  readonly type: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly installDate: Date;
  readonly efficiency: number | null;
  readonly fuelTypeId: string | null;
  readonly refrigerantId: string | null;
  readonly isActive: boolean;
};

export const DEMO_EQUIPMENT: readonly DemoEquipment[] = [
  {
    id: "demo-eq-ulsan-boiler-1",
    productionLineId: "demo-line-ulsan-1",
    name: "울산 LNG 스팀보일러 #1 (Ulsan LNG Steam Boiler #1)",
    code: "ULS-BLR-01",
    type: "Steam boiler",
    manufacturer: "Kyungdong",
    model: "KD-STM-8000",
    installDate: new Date(Date.UTC(2012, 4, 18)),
    efficiency: 0.91,
    fuelTypeId: "demo-fueltype-natural-gas",
    refrigerantId: null,
    isActive: true,
  },
  {
    id: "demo-eq-ulsan-extruder-1",
    productionLineId: "demo-line-ulsan-1",
    name: "울산 트윈스크류 압출기 #1 (Ulsan Twin-screw Extruder #1)",
    code: "ULS-EXT-01",
    type: "Extruder",
    manufacturer: "Coperion",
    model: "ZSK-92",
    installDate: new Date(Date.UTC(2015, 8, 2)),
    efficiency: 0.87,
    fuelTypeId: null,
    refrigerantId: null,
    isActive: true,
  },
  {
    id: "demo-eq-ulsan-chiller-1",
    productionLineId: "demo-line-ulsan-2",
    name: "울산 공정냉각 칠러 #1 (Ulsan Process Chiller #1)",
    code: "ULS-CHL-01",
    type: "Centrifugal chiller",
    manufacturer: "LG",
    model: "RCUW-1200",
    installDate: new Date(Date.UTC(2018, 2, 26)),
    efficiency: 0.94,
    fuelTypeId: null,
    refrigerantId: "demo-refrigerant-r410a",
    isActive: true,
  },
  {
    id: "demo-eq-pyeongtaek-boiler-1",
    productionLineId: "demo-line-pyeongtaek-1",
    name: "평택 경유 열매체보일러 (Pyeongtaek Diesel Thermal Boiler)",
    code: "PYT-BLR-01",
    type: "Thermal oil boiler",
    manufacturer: "Sungjin",
    model: "SJ-THO-3200",
    installDate: new Date(Date.UTC(2017, 10, 9)),
    efficiency: 0.88,
    fuelTypeId: "demo-fueltype-diesel",
    refrigerantId: null,
    isActive: true,
  },
  {
    id: "demo-eq-incheon-forklift-fleet",
    productionLineId: "demo-line-incheon-pack",
    name: "인천 지게차 편성 (Incheon Forklift Fleet)",
    code: "ICN-FLT-01",
    type: "Materials handling",
    manufacturer: "Doosan",
    model: "D30S-9",
    installDate: new Date(Date.UTC(2020, 5, 15)),
    efficiency: null,
    fuelTypeId: "demo-fueltype-diesel",
    refrigerantId: null,
    isActive: true,
  },
];

export type DemoEmissionSource = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly scope: GHGScope;
  readonly scope3Category: Scope3Category | null;
  readonly sourceType: string;
  readonly calculationApproach: CalculationApproach;
  readonly facilityId: string | null;
  readonly buildingId: string | null;
  readonly productionLineId: string | null;
  readonly equipmentId: string | null;
  readonly isActive: boolean;
};

/**
 * 13 sources: 4 Scope 1, 3 Scope 2 and 6 Scope 3 categories. Every source is
 * anchored to a facility so the roll-up and consolidation paths have a complete
 * hierarchy to walk.
 */
export const DEMO_EMISSION_SOURCES: readonly DemoEmissionSource[] = [
  {
    id: "demo-src-ulsan-boiler-ng",
    name: "울산 보일러 LNG 연소 (Ulsan boiler natural gas)",
    code: "S1-ULS-NG",
    scope: "SCOPE_1",
    scope3Category: null,
    sourceType: "STATIONARY",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-ulsan",
    buildingId: "demo-bld-ulsan-util",
    productionLineId: "demo-line-ulsan-1",
    equipmentId: "demo-eq-ulsan-boiler-1",
    isActive: true,
  },
  {
    id: "demo-src-pyeongtaek-boiler-diesel",
    name: "평택 보일러 경유 연소 (Pyeongtaek boiler diesel)",
    code: "S1-PYT-DSL",
    scope: "SCOPE_1",
    scope3Category: null,
    sourceType: "STATIONARY",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-pyeongtaek",
    buildingId: "demo-bld-pyeongtaek-a",
    productionLineId: "demo-line-pyeongtaek-1",
    equipmentId: "demo-eq-pyeongtaek-boiler-1",
    isActive: true,
  },
  {
    id: "demo-src-incheon-fleet-diesel",
    name: "인천 사내운반차량 경유 (Incheon on-site fleet diesel)",
    code: "S1-ICN-MOB",
    scope: "SCOPE_1",
    scope3Category: null,
    sourceType: "MOBILE",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-incheon",
    buildingId: "demo-bld-incheon-wh",
    productionLineId: "demo-line-incheon-pack",
    equipmentId: "demo-eq-incheon-forklift-fleet",
    isActive: true,
  },
  {
    id: "demo-src-ulsan-chiller-r410a",
    name: "울산 칠러 냉매 누출 (Ulsan chiller refrigerant leakage)",
    code: "S1-ULS-FUG",
    scope: "SCOPE_1",
    scope3Category: null,
    sourceType: "FUGITIVE",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-ulsan",
    buildingId: "demo-bld-ulsan-a",
    productionLineId: "demo-line-ulsan-2",
    equipmentId: "demo-eq-ulsan-chiller-1",
    isActive: true,
  },
  {
    id: "demo-src-ulsan-electricity",
    name: "울산 구매전력 (Ulsan purchased electricity)",
    code: "S2-ULS-ELE",
    scope: "SCOPE_2_LOCATION",
    scope3Category: null,
    sourceType: "PURCHASED_ELECTRICITY",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-ulsan",
    buildingId: "demo-bld-ulsan-a",
    productionLineId: "demo-line-ulsan-1",
    equipmentId: "demo-eq-ulsan-extruder-1",
    isActive: true,
  },
  {
    id: "demo-src-pyeongtaek-electricity",
    name: "평택 구매전력 (Pyeongtaek purchased electricity)",
    code: "S2-PYT-ELE",
    scope: "SCOPE_2_LOCATION",
    scope3Category: null,
    sourceType: "PURCHASED_ELECTRICITY",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-pyeongtaek",
    buildingId: "demo-bld-pyeongtaek-a",
    productionLineId: "demo-line-pyeongtaek-1",
    equipmentId: null,
    isActive: true,
  },
  {
    id: "demo-src-incheon-electricity",
    name: "인천 구매전력 (Incheon purchased electricity)",
    code: "S2-ICN-ELE",
    scope: "SCOPE_2_LOCATION",
    scope3Category: null,
    sourceType: "PURCHASED_ELECTRICITY",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-incheon",
    buildingId: "demo-bld-incheon-wh",
    productionLineId: "demo-line-incheon-pack",
    equipmentId: null,
    isActive: true,
  },
  {
    id: "demo-src-cat1-resin",
    name: "구매 수지 원료 (Purchased polymer resin)",
    code: "S3-C1-RESIN",
    scope: "SCOPE_3",
    scope3Category: "CAT_1_PURCHASED_GOODS",
    sourceType: "PURCHASED_GOODS",
    calculationApproach: "SUPPLIER_SPECIFIC",
    facilityId: "demo-fac-ulsan",
    buildingId: null,
    productionLineId: null,
    equipmentId: null,
    isActive: true,
  },
  {
    id: "demo-src-cat3-wtt-electricity",
    name: "전력 상류배출 (WTT) (Well-to-tank of purchased electricity)",
    code: "S3-C3-WTT",
    scope: "SCOPE_3",
    scope3Category: "CAT_3_FUEL_ENERGY",
    sourceType: "FUEL_AND_ENERGY",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-ulsan",
    buildingId: null,
    productionLineId: null,
    equipmentId: null,
    isActive: true,
  },
  {
    id: "demo-src-cat4-inbound-freight",
    name: "상류 물류 (Upstream inbound freight)",
    code: "S3-C4-FRT",
    scope: "SCOPE_3",
    scope3Category: "CAT_4_UPSTREAM_TRANSPORT",
    sourceType: "UPSTREAM_TRANSPORT",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-incheon",
    buildingId: null,
    productionLineId: null,
    equipmentId: null,
    isActive: true,
  },
  {
    id: "demo-src-cat5-waste",
    name: "사업장 폐기물 (Operational waste)",
    code: "S3-C5-WST",
    scope: "SCOPE_3",
    scope3Category: "CAT_5_WASTE",
    sourceType: "WASTE",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-ulsan",
    buildingId: null,
    productionLineId: null,
    equipmentId: null,
    isActive: true,
  },
  {
    id: "demo-src-cat6-business-travel",
    name: "임직원 출장 (Business travel)",
    code: "S3-C6-TRV",
    scope: "SCOPE_3",
    scope3Category: "CAT_6_BUSINESS_TRAVEL",
    sourceType: "BUSINESS_TRAVEL",
    calculationApproach: "ACTIVITY_BASED",
    facilityId: "demo-fac-ulsan",
    buildingId: null,
    productionLineId: null,
    equipmentId: null,
    isActive: true,
  },
  {
    id: "demo-src-cat7-commuting",
    name: "임직원 통근 (Employee commuting)",
    code: "S3-C7-CMT",
    scope: "SCOPE_3",
    scope3Category: "CAT_7_EMPLOYEE_COMMUTING",
    sourceType: "COMMUTING",
    calculationApproach: "AVERAGE_DATA",
    facilityId: "demo-fac-ulsan",
    buildingId: null,
    productionLineId: null,
    equipmentId: null,
    isActive: true,
  },
];

/** Resolves the full hierarchy path for an emission source id. */
export type SourceHierarchy = {
  readonly organizationId: string;
  readonly businessUnitId: string | null;
  readonly facilityId: string | null;
  readonly buildingId: string | null;
  readonly productionLineId: string | null;
  readonly equipmentId: string | null;
  readonly emissionSourceId: string;
};

const FACILITY_BY_ID = new Map(DEMO_FACILITIES.map((facility) => [facility.id, facility]));

export const DEMO_SOURCE_HIERARCHY: Readonly<Record<string, SourceHierarchy>> =
  Object.fromEntries(
    DEMO_EMISSION_SOURCES.map((source) => {
      const facility = source.facilityId ? FACILITY_BY_ID.get(source.facilityId) : undefined;
      return [
        source.id,
        {
          organizationId: DEMO_ORGANIZATION_ID,
          businessUnitId: facility?.businessUnitId ?? null,
          facilityId: source.facilityId,
          buildingId: source.buildingId,
          productionLineId: source.productionLineId,
          equipmentId: source.equipmentId,
          emissionSourceId: source.id,
        } satisfies SourceHierarchy,
      ];
    }),
  );
