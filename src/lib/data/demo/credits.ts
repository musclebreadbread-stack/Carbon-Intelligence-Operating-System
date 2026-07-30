/**
 * Demo tenant: carbon credits, retirements, price signals and coverage contracts.
 *
 * Vintages are deliberately spread across 2019-2023 so FIFO retirement in
 * `retireCredits` visibly consumes the oldest vintage first, and one batch expires
 * inside the reporting year so `expiringCredits` has something to report.
 */

import type { CreditStatus } from "@/lib/core/enums";
import type { CarbonCreditLike, CarbonOffsetLike } from "@/lib/domain/credits/registry";
import type { CarbonPriceLike } from "@/lib/domain/credits/pricing";

import { DEMO_CURRENT_YEAR } from "./activity-data";
import { DEMO_ORGANIZATION_ID } from "./organization";

type DemoCredit = CarbonCreditLike & {
  readonly organizationId: string;
  readonly projectName: string;
  readonly projectType: string;
  readonly verificationStandard: string;
  readonly methodology: string;
  readonly country: string;
  readonly price: number;
  readonly currency: string;
};

export const DEMO_CARBON_CREDITS: readonly DemoCredit[] = [
  {
    id: "demo-credit-verra-2019",
    organizationId: DEMO_ORGANIZATION_ID,
    serialNumber: "VCS-1042-2019-KR-0001",
    registry: "Verra",
    projectName: "Jeolla improved cookstoves",
    projectType: "Energy efficiency — household",
    vintage: 2019,
    quantity: 3_200,
    unit: "tCO2e",
    status: "ISSUED" satisfies CreditStatus,
    verificationStandard: "VCS",
    methodology: "AMS-II.G",
    country: "KR",
    issuedAt: new Date(Date.UTC(2020, 3, 14)),
    retiredAt: null,
    // Expires inside the reporting year, so the expiry report is non-empty.
    expiresAt: new Date(Date.UTC(2025, 3, 14)),
    price: 6.4,
    currency: "USD",
  },
  {
    id: "demo-credit-gs-2020",
    organizationId: DEMO_ORGANIZATION_ID,
    serialNumber: "GS-2210-2020-VN-0114",
    registry: "Gold Standard",
    projectName: "Mekong Delta rice methane reduction",
    projectType: "Agriculture — methane",
    vintage: 2020,
    quantity: 4_500,
    unit: "tCO2e",
    status: "ACTIVE",
    verificationStandard: "Gold Standard",
    methodology: "GS-AMS-III.AU",
    country: "VN",
    issuedAt: new Date(Date.UTC(2021, 6, 2)),
    retiredAt: null,
    expiresAt: new Date(Date.UTC(2027, 6, 2)),
    price: 9.1,
    currency: "USD",
  },
  {
    id: "demo-credit-verra-2021-retired",
    organizationId: DEMO_ORGANIZATION_ID,
    serialNumber: "VCS-3391-2021-ID-0077",
    registry: "Verra",
    projectName: "Kalimantan peatland conservation",
    projectType: "REDD+",
    vintage: 2021,
    quantity: 2_800,
    unit: "tCO2e",
    status: "RETIRED",
    verificationStandard: "VCS",
    methodology: "VM0007",
    country: "ID",
    issuedAt: new Date(Date.UTC(2022, 1, 18)),
    retiredAt: new Date(Date.UTC(2024, 2, 31)),
    expiresAt: new Date(Date.UTC(2029, 1, 18)),
    price: 12.8,
    currency: "USD",
  },
  {
    id: "demo-credit-puro-2022",
    organizationId: DEMO_ORGANIZATION_ID,
    serialNumber: "PURO-BC-2022-KR-0009",
    registry: "Puro.earth",
    projectName: "Ulsan biochar carbon removal",
    projectType: "Durable removal — biochar",
    vintage: 2022,
    quantity: 900,
    unit: "tCO2e",
    status: "ACTIVE",
    verificationStandard: "Puro Standard",
    methodology: "Puro Biochar Methodology 2022",
    country: "KR",
    issuedAt: new Date(Date.UTC(2023, 0, 25)),
    retiredAt: null,
    expiresAt: null,
    price: 148,
    currency: "USD",
  },
  {
    id: "demo-credit-gs-2023",
    organizationId: DEMO_ORGANIZATION_ID,
    serialNumber: "GS-4471-2023-IN-0201",
    registry: "Gold Standard",
    projectName: "Gujarat wind repowering",
    projectType: "Renewable energy",
    vintage: 2023,
    quantity: 5_600,
    unit: "tCO2e",
    status: "ACTIVE",
    verificationStandard: "Gold Standard",
    methodology: "ACM0002",
    country: "IN",
    issuedAt: new Date(Date.UTC(2024, 0, 9)),
    retiredAt: null,
    expiresAt: new Date(Date.UTC(2030, 0, 9)),
    price: 7.9,
    currency: "USD",
  },
];

/** Retirements already recorded, so a fresh retirement cannot double-spend. */
export const DEMO_CARBON_OFFSETS: readonly (CarbonOffsetLike & {
  readonly purpose: string;
  readonly notes: string;
})[] = [
  {
    id: "demo-offset-2024-q1",
    creditId: "demo-credit-verra-2021-retired",
    quantity: 2_800,
    unit: "tCO2e",
    offsetDate: new Date(Date.UTC(2024, 2, 31)),
    purpose: "2023 carbon-neutral product line claim",
    reportingYear: 2023,
    notes: "Retired in full against the 2023 HB-Film B neutrality claim.",
  },
  {
    id: "demo-offset-2024-q3",
    creditId: "demo-credit-verra-2019",
    quantity: 400,
    unit: "tCO2e",
    offsetDate: new Date(Date.UTC(2024, 8, 12)),
    purpose: "Business travel neutralisation",
    reportingYear: DEMO_CURRENT_YEAR,
    notes: "Partial retirement of the oldest vintage.",
  },
];

export type DemoCarbonPrice = CarbonPriceLike & { readonly unit: string };

export const DEMO_CARBON_PRICES: readonly DemoCarbonPrice[] = [
  {
    market: "K-ETS (KAU)",
    region: "KR",
    price: 6_400,
    currency: "KRW",
    unit: "per tCO2e",
    priceDate: new Date(Date.UTC(2024, 11, 20)),
  },
  {
    market: "EU ETS (EUA)",
    region: "EU",
    price: 68.4,
    currency: "EUR",
    unit: "per tCO2e",
    priceDate: new Date(Date.UTC(2024, 11, 20)),
  },
  {
    market: "Voluntary — nature-based (N-GEO)",
    region: "Global",
    price: 4.6,
    currency: "USD",
    unit: "per tCO2e",
    priceDate: new Date(Date.UTC(2024, 11, 20)),
  },
  {
    market: "Voluntary — durable removal",
    region: "Global",
    price: 152,
    currency: "USD",
    unit: "per tCO2e",
    priceDate: new Date(Date.UTC(2024, 11, 20)),
  },
];

export type DemoInternalCarbonPrice = {
  readonly id: string;
  readonly organizationId: string;
  readonly price: number;
  readonly currency: string;
  readonly unit: string;
  readonly purpose: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly methodology: string;
  readonly approvedBy: string;
};

export const DEMO_INTERNAL_CARBON_PRICE: DemoInternalCarbonPrice = {
  id: "demo-icp-2024",
  organizationId: DEMO_ORGANIZATION_ID,
  price: 75,
  currency: "USD",
  unit: "per tCO2e",
  purpose: "Capital allocation shadow price for all investments above USD 250k",
  effectiveFrom: new Date(Date.UTC(2024, 0, 1)),
  effectiveTo: null,
  methodology: "Shadow price set to the 2030 IEA APS marginal abatement cost",
  approvedBy: "Board Sustainability Committee",
};

/** K-ETS allocation and compliance position for the reporting year. */
export type DemoEtsPosition = {
  readonly scheme: string;
  readonly reportingYear: number;
  readonly allocated: number;
  readonly verified: number;
  readonly surrendered: number;
  readonly purchased: number;
  readonly sold: number;
  readonly price: number;
  readonly currency: string;
};

export const DEMO_ETS_POSITION: DemoEtsPosition = {
  scheme: "K-ETS",
  reportingYear: DEMO_CURRENT_YEAR,
  allocated: 21_000,
  verified: 21_817,
  surrendered: 19_500,
  purchased: 900,
  sold: 0,
  price: 6_400,
  currency: "KRW",
};

export type DemoPpa = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly counterparty: string;
  readonly technology: string;
  readonly type: "PHYSICAL" | "VIRTUAL" | "SLEEVED" | "ONSITE";
  readonly capacityMw: number;
  readonly annualVolume: number;
  readonly volumeUnit: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly country: string;
  readonly price: number;
  readonly currency: string;
};

export const DEMO_PPAS: readonly DemoPpa[] = [
  {
    id: "demo-ppa-ulsan-solar",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "울산 태양광 PPA (Ulsan solar PPA)",
    counterparty: "Hanbit Solar SPC",
    technology: "Solar PV",
    type: "PHYSICAL",
    capacityMw: 3.6,
    // 420,000 kWh/month x 12, matching the market-based Scope 2 instrument.
    annualVolume: 5_040,
    volumeUnit: "MWh",
    startDate: new Date(Date.UTC(2023, 0, 1)),
    endDate: new Date(Date.UTC(2038, 0, 1)),
    country: "KR",
    price: 132,
    currency: "KRW",
  },
];

export type DemoRec = {
  readonly id: string;
  readonly organizationId: string;
  readonly certificateId: string;
  readonly standard: string;
  readonly technology: string;
  readonly quantity: number;
  readonly unit: string;
  readonly vintage: number;
  readonly country: string;
  readonly retiredAt: Date;
};

export const DEMO_RECS: readonly DemoRec[] = [
  {
    id: "demo-rec-incheon-irec-2024",
    organizationId: DEMO_ORGANIZATION_ID,
    certificateId: "IREC-KR-2024-000318",
    standard: "I-REC",
    technology: "Wind",
    // 120,000 kWh/month x 12, matching the Incheon market-based instrument.
    quantity: 1_440,
    unit: "MWh",
    vintage: 2024,
    country: "KR",
    retiredAt: new Date(Date.UTC(2025, 2, 31)),
  },
];
