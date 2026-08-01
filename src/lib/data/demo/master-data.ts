/**
 * Demo tenant: master data referenced by the activity entries.
 *
 * Calorific values and densities are IPCC 2006 Guidelines Vol. 2 defaults;
 * refrigerant GWPs come from the AR5/AR6 table in `src/lib/reference/gwp.ts`.
 */

import type { EnergyType, FuelCategory, VehicleType } from "@/lib/core/enums";
import { DEMO_ORGANIZATION_ID } from "./organization";

export type DemoFuelType = {
  readonly id: string;
  readonly name: string;
  readonly category: FuelCategory;
  readonly description: string;
};

export const DEMO_FUEL_TYPES: readonly DemoFuelType[] = [
  {
    id: "demo-fueltype-natural-gas",
    name: "Natural gas",
    category: "GASEOUS",
    description: "Pipeline natural gas / LNG regasified.",
  },
  {
    id: "demo-fueltype-diesel",
    name: "Diesel (gas oil)",
    category: "LIQUID",
    description: "Automotive and industrial gas oil.",
  },
  {
    id: "demo-fueltype-lpg",
    name: "LPG",
    category: "GASEOUS",
    description: "Liquefied petroleum gas, propane/butane blend.",
  },
  {
    id: "demo-fueltype-wood-pellet",
    name: "Wood pellet",
    category: "BIOMASS",
    description: "Certified biomass pellet; CO2 reported as biogenic.",
  },
];

export type DemoFuel = {
  readonly id: string;
  readonly name: string;
  readonly fuelTypeId: string;
  readonly unit: string;
  /** Net calorific value in MJ per unit. */
  readonly netCalorific: number;
  readonly grossCalorific: number;
  /** kg per unit. */
  readonly density: number | null;
  /** tonnes of carbon per TJ, IPCC 2006 Vol. 2 default. */
  readonly carbonContent: number;
  readonly isRenewable: boolean;
};

export const DEMO_FUELS: readonly DemoFuel[] = [
  {
    id: "demo-fuel-natural-gas",
    name: "천연가스 (Natural gas)",
    fuelTypeId: "demo-fueltype-natural-gas",
    unit: "m3",
    netCalorific: 38.6,
    grossCalorific: 42.8,
    density: 0.717,
    carbonContent: 15.3,
    isRenewable: false,
  },
  {
    id: "demo-fuel-diesel",
    name: "경유 (Diesel)",
    fuelTypeId: "demo-fueltype-diesel",
    unit: "L",
    netCalorific: 36.0,
    grossCalorific: 38.6,
    density: 0.845,
    carbonContent: 20.2,
    isRenewable: false,
  },
  {
    id: "demo-fuel-lpg",
    name: "LPG",
    fuelTypeId: "demo-fueltype-lpg",
    unit: "L",
    netCalorific: 25.3,
    grossCalorific: 27.5,
    density: 0.54,
    carbonContent: 17.2,
    isRenewable: false,
  },
  {
    id: "demo-fuel-wood-pellet",
    name: "목재펠릿 (Wood pellet)",
    fuelTypeId: "demo-fueltype-wood-pellet",
    unit: "t",
    netCalorific: 17_000,
    grossCalorific: 18_500,
    density: null,
    carbonContent: 30.5,
    isRenewable: true,
  },
];

export type DemoVehicle = {
  readonly id: string;
  readonly name: string;
  readonly type: VehicleType;
  readonly fuelType: string;
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly efficiency: number;
  readonly efficiencyUnit: string;
  readonly isOwned: boolean;
};

export const DEMO_VEHICLES: readonly DemoVehicle[] = [
  {
    id: "demo-vehicle-forklift",
    name: "디젤 지게차 (Diesel forklift)",
    type: "TRUCK",
    fuelType: "Diesel",
    make: "Doosan",
    model: "D30S-9",
    year: 2020,
    efficiency: 3.2,
    efficiencyUnit: "L/h",
    isOwned: true,
  },
  {
    id: "demo-vehicle-yard-tractor",
    name: "야드 트랙터 (Yard tractor)",
    type: "TRUCK",
    fuelType: "Diesel",
    make: "Hyundai",
    model: "HD-YT",
    year: 2021,
    efficiency: 2.6,
    efficiencyUnit: "km/L",
    isOwned: true,
  },
  {
    id: "demo-vehicle-sales-car",
    name: "영업용 승용차 (Sales passenger car)",
    type: "CAR",
    fuelType: "Gasoline",
    make: "Kia",
    model: "K5",
    year: 2022,
    efficiency: 13.4,
    efficiencyUnit: "km/L",
    isOwned: true,
  },
];

export type DemoRefrigerant = {
  readonly id: string;
  readonly name: string;
  readonly chemicalFormula: string;
  readonly gwp100: number;
  readonly ozoneDepletionPotential: number;
  readonly category: string;
};

export const DEMO_REFRIGERANTS: readonly DemoRefrigerant[] = [
  {
    id: "demo-refrigerant-r410a",
    name: "R-410A",
    chemicalFormula: "HFC-32/HFC-125 (50/50)",
    // AR6 GWP-100 blend value, computed from the component GWPs.
    gwp100: 2255.5,
    ozoneDepletionPotential: 0,
    category: "HFC blend",
  },
  {
    id: "demo-refrigerant-r134a",
    name: "HFC-134a",
    chemicalFormula: "CH2FCF3",
    gwp100: 1526,
    ozoneDepletionPotential: 0,
    category: "HFC",
  },
  {
    id: "demo-refrigerant-r404a",
    name: "R-404A",
    chemicalFormula: "HFC-125/HFC-143a/HFC-134a",
    gwp100: 3942.5,
    ozoneDepletionPotential: 0,
    category: "HFC blend",
  },
];

export type DemoSupplier = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly code: string;
  readonly category: string;
  readonly country: string;
  readonly contactEmail: string;
  readonly tier: number;
  readonly sustainabilityRating: string;
  readonly isActive: boolean;
};

export const DEMO_SUPPLIERS: readonly DemoSupplier[] = [
  {
    id: "demo-supplier-resin",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "대성수지 (Daesung Resin)",
    code: "SUP-RESIN",
    category: "Raw material",
    country: "KR",
    contactEmail: "esg@example.com",
    tier: 1,
    sustainabilityRating: "A",
    isActive: true,
  },
  {
    id: "demo-supplier-additive",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "Kyushu Additives",
    code: "SUP-ADDT",
    category: "Raw material",
    country: "JP",
    contactEmail: "sustainability@example.com",
    tier: 1,
    sustainabilityRating: "B",
    isActive: true,
  },
  {
    id: "demo-supplier-freight",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "한성로지스 (Hansung Logis)",
    code: "SUP-FRT",
    category: "Logistics",
    country: "KR",
    contactEmail: "ops@example.com",
    tier: 1,
    sustainabilityRating: "B",
    isActive: true,
  },
  {
    id: "demo-supplier-waste",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "청우환경 (Cheongwoo Environment)",
    code: "SUP-WST",
    category: "Waste management",
    country: "KR",
    contactEmail: "contact@example.com",
    tier: 2,
    sustainabilityRating: "C",
    isActive: true,
  },
];

export type DemoProduct = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly sku: string;
  readonly category: string;
  readonly unit: string;
  readonly weight: number;
  readonly weightUnit: string;
  readonly lifecycleStage: string;
  readonly isActive: boolean;
};

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    id: "demo-product-compound-a",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "HB-Compound A (난연 컴파운드)",
    sku: "HBC-A-25",
    category: "Polymer compound",
    unit: "t",
    weight: 25,
    weightUnit: "kg",
    lifecycleStage: "CRADLE_TO_GATE",
    isActive: true,
  },
  {
    id: "demo-product-film-b",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "HB-Film B (포장용 필름)",
    sku: "HBF-B-50",
    category: "Packaging film",
    unit: "t",
    weight: 50,
    weightUnit: "kg",
    lifecycleStage: "CRADLE_TO_GRAVE",
    isActive: true,
  },
];

export type DemoRawMaterial = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly unit: string;
  /** kgCO2e per unit, supplier-declared. */
  readonly emissionIntensity: number;
  readonly sourceRegion: string;
  readonly isRecycled: boolean;
  readonly recycledContent: number;
};

export const DEMO_RAW_MATERIALS: readonly DemoRawMaterial[] = [
  {
    id: "demo-material-pp-resin",
    name: "폴리프로필렌 수지 (Polypropylene resin)",
    category: "Polymer",
    unit: "t",
    emissionIntensity: 1_950,
    sourceRegion: "KR",
    isRecycled: false,
    recycledContent: 0,
  },
  {
    id: "demo-material-recycled-pp",
    name: "재생 폴리프로필렌 (Recycled polypropylene)",
    category: "Polymer",
    unit: "t",
    emissionIntensity: 640,
    sourceRegion: "KR",
    isRecycled: true,
    recycledContent: 0.95,
  },
  {
    id: "demo-material-flame-retardant",
    name: "난연제 (Flame retardant additive)",
    category: "Additive",
    unit: "t",
    emissionIntensity: 3_420,
    sourceRegion: "JP",
    isRecycled: false,
    recycledContent: 0,
  },
];

export type DemoLogisticsRoute = {
  readonly id: string;
  readonly name: string;
  readonly origin: string;
  readonly destination: string;
  readonly distance: number;
  readonly distanceUnit: string;
  readonly transportMode: string;
  readonly isReturn: boolean;
};

export const DEMO_LOGISTICS_ROUTES: readonly DemoLogisticsRoute[] = [
  {
    id: "demo-route-ulsan-incheon",
    name: "울산 → 인천 (Ulsan to Incheon)",
    origin: "Ulsan, KR",
    destination: "Incheon, KR",
    distance: 411,
    distanceUnit: "km",
    transportMode: "ROAD_HGV",
    isReturn: true,
  },
  {
    id: "demo-route-yeosu-ulsan",
    name: "여수 → 울산 (Yeosu to Ulsan)",
    origin: "Yeosu, KR",
    destination: "Ulsan, KR",
    distance: 268,
    distanceUnit: "km",
    transportMode: "ROAD_HGV",
    isReturn: false,
  },
  {
    id: "demo-route-fukuoka-busan",
    name: "후쿠오카 → 부산 (Fukuoka to Busan)",
    origin: "Fukuoka, JP",
    destination: "Busan, KR",
    distance: 214,
    distanceUnit: "km",
    transportMode: "SEA_CONTAINER",
    isReturn: false,
  },
];

export type DemoEnergySource = {
  readonly id: string;
  readonly name: string;
  readonly type: EnergyType;
  readonly provider: string;
  readonly gridRegion: string;
  readonly renewablePercent: number;
  readonly contractType: string;
};

export const DEMO_ENERGY_SOURCES: readonly DemoEnergySource[] = [
  {
    id: "demo-energy-kepco-grid",
    name: "한국전력 계통전력 (KEPCO grid electricity)",
    type: "ELECTRICITY",
    provider: "KEPCO",
    gridRegion: "KR",
    renewablePercent: 8.6,
    contractType: "STANDARD_TARIFF",
  },
  {
    id: "demo-energy-ppa-solar",
    name: "태양광 PPA (Solar PPA)",
    type: "SOLAR",
    provider: "Hanbit Energy PPA",
    gridRegion: "KR",
    renewablePercent: 100,
    contractType: "PHYSICAL_PPA",
  },
  {
    id: "demo-energy-district-steam",
    name: "산업단지 스팀 (Industrial district steam)",
    type: "STEAM",
    provider: "Ulsan Industrial Complex Utility",
    gridRegion: "KR",
    renewablePercent: 0,
    contractType: "STANDARD_TARIFF",
  },
];

export type DemoWasteType = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly disposalMethod: string;
  readonly isHazardous: boolean;
  readonly recyclingRate: number;
};

export const DEMO_WASTE_TYPES: readonly DemoWasteType[] = [
  {
    id: "demo-waste-plastic-scrap",
    name: "플라스틱 스크랩 (Plastic scrap)",
    category: "Non-hazardous industrial",
    disposalMethod: "RECYCLING",
    isHazardous: false,
    recyclingRate: 0.82,
  },
  {
    id: "demo-waste-general",
    name: "일반 사업장폐기물 (General industrial waste)",
    category: "Non-hazardous industrial",
    disposalMethod: "INCINERATION",
    isHazardous: false,
    recyclingRate: 0.11,
  },
  {
    id: "demo-waste-solvent",
    name: "폐용제 (Waste solvent)",
    category: "Hazardous",
    disposalMethod: "INCINERATION",
    isHazardous: true,
    recyclingRate: 0,
  },
];

export type DemoWaterSource = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly source: string;
  readonly treatment: string;
  readonly isRecycled: boolean;
};

export const DEMO_WATER_SOURCES: readonly DemoWaterSource[] = [
  {
    id: "demo-water-municipal",
    name: "공업용수 (Industrial municipal supply)",
    type: "SURFACE",
    source: "Ulsan Industrial Water Authority",
    treatment: "FILTRATION",
    isRecycled: false,
  },
  {
    id: "demo-water-recycled",
    name: "재이용수 (Recycled process water)",
    type: "RECLAIMED",
    source: "On-site treatment",
    treatment: "RO",
    isRecycled: true,
  },
];
