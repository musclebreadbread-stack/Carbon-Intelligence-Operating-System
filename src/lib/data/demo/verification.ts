/**
 * Demo tenant: MRV plan, monitoring parameters, measurements, the verification
 * engagement and its findings.
 *
 * `MonitoringParameter.emissionSourceId` is not a Prisma column — the association
 * lives in the fixture (and, on a real database, in the data layer's join) and is
 * passed to `monitoringPlanCoverage` denormalised. Two of the thirteen emission
 * sources are deliberately left uncovered so the coverage gap report is non-empty.
 */

import type { MeasurementFrequency, ReportingFramework, VerificationStatus } from "@/lib/core/enums";
import type { MeasurementLike, MonitoringParameterLike } from "@/lib/domain/mrv/plan";
import type { AssuranceLevel, OpinionType } from "@/lib/domain/verification/materiality";
import type { VerificationFindingLike } from "@/lib/domain/verification/findings";

import { DEMO_ACTIVITY_ENTRIES, DEMO_CURRENT_YEAR } from "./activity-data";
import { DEMO_EMISSION_SOURCES, DEMO_ORGANIZATION_ID } from "./organization";

export type DemoMrvPlan = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description: string;
  readonly framework: string;
  readonly version: string;
  readonly status: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly approvedAt: Date;
  readonly approvedBy: string;
};

export const DEMO_MRV_PLAN: DemoMrvPlan = {
  id: "demo-mrv-plan-2024",
  organizationId: DEMO_ORGANIZATION_ID,
  name: "2024 모니터링·보고·검증 계획 (2024 MRV plan)",
  description:
    "Monitoring, reporting and verification plan covering all Scope 1 and Scope 2 sources and the six material Scope 3 categories.",
  framework: "ISO 14064-1:2018",
  version: "1.2",
  status: "active",
  startDate: new Date(Date.UTC(2024, 0, 1)),
  endDate: new Date(Date.UTC(2024, 11, 31)),
  approvedAt: new Date(Date.UTC(2023, 11, 18)),
  approvedBy: "Head of Sustainability",
};

export type DemoMonitoringPlan = {
  readonly id: string;
  readonly mrvPlanId: string;
  readonly name: string;
  readonly description: string;
  readonly frequency: MeasurementFrequency;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly status: string;
};

export const DEMO_MONITORING_PLAN: DemoMonitoringPlan = {
  id: "demo-monitoring-plan-2024",
  mrvPlanId: DEMO_MRV_PLAN.id,
  name: "월간 계측 계획 (Monthly measurement plan)",
  description: "Monthly readings for every metered source, hourly for the boiler flow meter.",
  frequency: "MONTHLY",
  startDate: new Date(Date.UTC(2024, 0, 1)),
  endDate: new Date(Date.UTC(2024, 11, 31)),
  status: "active",
};

type DemoMonitoringParameter = MonitoringParameterLike & {
  readonly monitoringPlanId: string;
  readonly description: string;
};

/**
 * Eleven parameters against thirteen sources: business travel and employee
 * commuting are survey-based and intentionally have no monitoring parameter.
 */
export const DEMO_MONITORING_PARAMETERS: readonly DemoMonitoringParameter[] = [
  {
    id: "demo-mp-ulsan-ng-flow",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "울산 보일러 가스 유량 (Ulsan boiler gas flow)",
    description: "Custody-transfer gas meter on the LNG supply line.",
    unit: "m3",
    frequency: "HOURLY",
    methodology: "Ultrasonic flow meter, calibrated annually",
    threshold: 220_000,
    alertOnBreach: true,
    emissionSourceId: "demo-src-ulsan-boiler-ng",
  },
  {
    id: "demo-mp-pyeongtaek-diesel-volume",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "평택 경유 수급량 (Pyeongtaek diesel receipts)",
    description: "Tank dip plus delivery notes reconciled monthly.",
    unit: "L",
    frequency: "MONTHLY",
    methodology: "Stock reconciliation against supplier invoices",
    threshold: 40_000,
    alertOnBreach: true,
    emissionSourceId: "demo-src-pyeongtaek-boiler-diesel",
  },
  {
    id: "demo-mp-incheon-fleet-fuel",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "인천 차량 연료 (Incheon fleet fuel)",
    description: "Fuel card transactions by vehicle.",
    unit: "L",
    frequency: "MONTHLY",
    methodology: "Fuel card data extract",
    threshold: null,
    alertOnBreach: false,
    emissionSourceId: "demo-src-incheon-fleet-diesel",
  },
  {
    id: "demo-mp-ulsan-refrigerant-topup",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "울산 냉매 충전량 (Ulsan refrigerant top-up)",
    description: "Service records for every chiller intervention.",
    unit: "kg",
    frequency: "MONTHLY",
    methodology: "Screening method: purchases less disposals, per GHG Protocol",
    threshold: 20,
    alertOnBreach: true,
    emissionSourceId: "demo-src-ulsan-chiller-r410a",
  },
  {
    id: "demo-mp-ulsan-electricity",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "울산 수전 전력량 (Ulsan incoming electricity)",
    description: "Main incoming meter, half-hourly settlement data.",
    unit: "kWh",
    frequency: "DAILY",
    methodology: "Utility settlement meter",
    threshold: 3_400_000,
    alertOnBreach: true,
    emissionSourceId: "demo-src-ulsan-electricity",
  },
  {
    id: "demo-mp-pyeongtaek-electricity",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "평택 수전 전력량 (Pyeongtaek incoming electricity)",
    description: "Main incoming meter read monthly by the JV operator.",
    unit: "kWh",
    frequency: "MONTHLY",
    methodology: "Utility settlement meter",
    threshold: null,
    alertOnBreach: false,
    emissionSourceId: "demo-src-pyeongtaek-electricity",
  },
  {
    id: "demo-mp-incheon-electricity",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "인천 수전 전력량 (Incheon incoming electricity)",
    description: "Main incoming meter, monthly read.",
    unit: "kWh",
    frequency: "MONTHLY",
    methodology: "Utility settlement meter",
    threshold: null,
    alertOnBreach: false,
    emissionSourceId: "demo-src-incheon-electricity",
  },
  {
    id: "demo-mp-resin-receipts",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "수지 원료 입고량 (Resin receipts)",
    description: "Goods-received quantities from the ERP.",
    unit: "t",
    frequency: "MONTHLY",
    methodology: "ERP goods receipt extract",
    threshold: null,
    alertOnBreach: false,
    emissionSourceId: "demo-src-cat1-resin",
  },
  {
    id: "demo-mp-wtt-electricity",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "전력 상류배출 활동량 (WTT activity basis)",
    description: "Derived from the metered electricity consumption.",
    unit: "kWh",
    frequency: "MONTHLY",
    methodology: "Calculated from the Scope 2 activity data",
    threshold: null,
    alertOnBreach: false,
    emissionSourceId: "demo-src-cat3-wtt-electricity",
  },
  {
    id: "demo-mp-freight-tonne-km",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "물류 톤킬로 (Freight tonne-kilometres)",
    description: "Consignment data from the 3PL API.",
    unit: "tkm",
    frequency: "MONTHLY",
    methodology: "Carrier consignment records x route distance",
    threshold: null,
    alertOnBreach: false,
    emissionSourceId: "demo-src-cat4-inbound-freight",
  },
  {
    id: "demo-mp-waste-tonnage",
    monitoringPlanId: DEMO_MONITORING_PLAN.id,
    name: "폐기물 처리량 (Waste tonnage)",
    description: "Weighbridge tickets from the licensed contractor.",
    unit: "t",
    frequency: "MONTHLY",
    methodology: "Contractor weighbridge tickets",
    threshold: 200,
    alertOnBreach: true,
    emissionSourceId: "demo-src-cat5-waste",
  },
];

/** `EmissionSourceLike` projection for `monitoringPlanCoverage`. */
export const DEMO_MONITORED_SOURCES = DEMO_EMISSION_SOURCES.map((source) => ({
  id: source.id,
  name: source.name,
  code: source.code,
  scope: source.scope,
  scope3Category: source.scope3Category,
  sourceType: source.sourceType,
  isActive: source.isActive,
  facilityId: source.facilityId,
}));

/**
 * Monthly measurements for the reporting year, valued from the matching activity
 * entry so the measured and reported quantities reconcile. One reading per
 * parameter per month, except that the Pyeongtaek electricity meter is missing two
 * months — the JV operator reported late — so `measurementCompleteness` is below
 * 100 % and finding 01 has something real to be about.
 */
const ENTRY_BY_SOURCE_AND_MONTH: ReadonlyMap<string, number> = new Map(
  DEMO_ACTIVITY_ENTRIES.filter(
    (entry) => entry.startDate.getUTCFullYear() === DEMO_CURRENT_YEAR,
  ).map((entry) => [
    `${entry.emissionSourceId}:${entry.startDate.getUTCMonth() + 1}`,
    entry.quantity,
  ]),
);

export const DEMO_MEASUREMENTS: readonly (MeasurementLike & {
  readonly mrvPlanId: string;
  readonly methodology: string | null;
})[] = DEMO_MONITORING_PARAMETERS.flatMap((parameter) =>
  Array.from({ length: 12 }, (_, index) => index + 1)
    .filter(
      (month) =>
        !(parameter.id === "demo-mp-pyeongtaek-electricity" && (month === 7 || month === 8)),
    )
    .map((month) => ({
      id: `demo-measurement-${parameter.id}-${String(month).padStart(2, "0")}`,
      mrvPlanId: DEMO_MRV_PLAN.id,
      monitoringParameterId: parameter.id,
      parameter: parameter.name,
      value: ENTRY_BY_SOURCE_AND_MONTH.get(`${parameter.emissionSourceId}:${month}`) ?? 0,
      unit: parameter.unit,
      frequency: parameter.frequency ?? DEMO_MONITORING_PLAN.frequency,
      methodology: parameter.methodology ?? null,
      measuredAt: new Date(Date.UTC(DEMO_CURRENT_YEAR, month, 0)),
      verifiedAt: null,
    })),
);

export type DemoVerificationEngagement = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly verifierName: string;
  readonly verifierOrg: string;
  readonly framework: ReportingFramework;
  readonly scope: string;
  readonly level: AssuranceLevel;
  readonly status: VerificationStatus;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly opinionType: OpinionType | null;
};

export const DEMO_VERIFICATION_ENGAGEMENT: DemoVerificationEngagement = {
  id: "demo-verification-2024",
  organizationId: DEMO_ORGANIZATION_ID,
  name: "2024 온실가스 인벤토리 검증 (2024 GHG inventory assurance)",
  verifierName: "Park Ji-hoon",
  verifierOrg: "Korea Verification Services",
  framework: "GHG_PROTOCOL",
  scope: "Scope 1, Scope 2 (dual reporting) and Scope 3 categories 1, 3, 4, 5, 6, 7",
  level: "LIMITED",
  status: "IN_PROGRESS",
  startDate: new Date(Date.UTC(2025, 0, 13)),
  endDate: new Date(Date.UTC(2025, 2, 28)),
  opinionType: null,
};

export type DemoVerificationScope = {
  readonly id: string;
  readonly engagementId: string;
  readonly category: string;
  readonly description: string;
  readonly boundaries: string;
  /** Materiality as a percentage of the verified total. */
  readonly materialityThreshold: number;
  readonly status: VerificationStatus;
};

export const DEMO_VERIFICATION_SCOPES: readonly DemoVerificationScope[] = [
  {
    id: "demo-vscope-scope1",
    engagementId: DEMO_VERIFICATION_ENGAGEMENT.id,
    category: "Scope 1",
    description: "Stationary, mobile and fugitive sources at all controlled facilities.",
    boundaries: "Operational control",
    materialityThreshold: 5,
    status: "VERIFIED",
  },
  {
    id: "demo-vscope-scope2",
    engagementId: DEMO_VERIFICATION_ENGAGEMENT.id,
    category: "Scope 2",
    description: "Dual location-based and market-based reporting including PPA and I-REC claims.",
    boundaries: "Operational control",
    materialityThreshold: 5,
    status: "IN_PROGRESS",
  },
  {
    id: "demo-vscope-scope3",
    engagementId: DEMO_VERIFICATION_ENGAGEMENT.id,
    category: "Scope 3",
    description: "Categories 1, 3, 4, 5, 6 and 7.",
    boundaries: "Value chain",
    materialityThreshold: 10,
    status: "IN_PROGRESS",
  },
];

/** Findings, with a quantified misstatement where the verifier could size one. */
export const DEMO_VERIFICATION_FINDINGS: readonly (VerificationFindingLike & {
  readonly engagementId: string;
  readonly type: string;
  readonly description: string;
  readonly recommendation: string | null;
  readonly misstatementAmount: number | null;
})[] = [
  {
    id: "demo-finding-01",
    engagementId: DEMO_VERIFICATION_ENGAGEMENT.id,
    type: "MISSTATEMENT",
    severity: "MAJOR",
    title: "평택 전력 사용량 2개월 추정 (Two months of Pyeongtaek electricity estimated)",
    description:
      "July and August 2024 electricity for the Pyeongtaek JV was estimated from the prior-year profile because the operator reported late.",
    recommendation:
      "Obtain the settlement meter data from the JV operator and restate the affected months.",
    status: "open",
    dueDate: new Date(Date.UTC(2025, 1, 14)),
    resolvedAt: null,
    misstatementAmount: 1_083,
  },
  {
    id: "demo-finding-02",
    engagementId: DEMO_VERIFICATION_ENGAGEMENT.id,
    type: "DOCUMENTATION",
    severity: "MINOR",
    title: "냉매 서비스 기록 누락 (Missing refrigerant service record)",
    description: "The March 2024 chiller top-up has an invoice but no service report.",
    recommendation: "Attach the contractor service report to the March evidence pack.",
    status: "in_progress",
    dueDate: new Date(Date.UTC(2025, 1, 28)),
    resolvedAt: null,
    misstatementAmount: null,
  },
  {
    id: "demo-finding-03",
    engagementId: DEMO_VERIFICATION_ENGAGEMENT.id,
    type: "CONTROL_WEAKNESS",
    severity: "MINOR",
    title: "통근 설문 응답률 낮음 (Low commuting survey response rate)",
    description: "The employee commuting survey achieved a 38 % response rate.",
    recommendation: "Raise the response rate above 60 % or move to an intensity-based estimate.",
    status: "open",
    dueDate: new Date(Date.UTC(2025, 4, 30)),
    resolvedAt: null,
    misstatementAmount: null,
  },
  {
    id: "demo-finding-04",
    engagementId: DEMO_VERIFICATION_ENGAGEMENT.id,
    type: "OBSERVATION",
    severity: "OBSERVATION",
    title: "폐기물 처리방법 구분 개선 (Refine waste treatment split)",
    description:
      "All operational waste is treated as combustion; the contractor reports a partial recycling route.",
    recommendation: "Split the waste stream by treatment route in the next reporting cycle.",
    status: "resolved",
    dueDate: new Date(Date.UTC(2025, 0, 31)),
    resolvedAt: new Date(Date.UTC(2025, 0, 22)),
    misstatementAmount: null,
  },
  {
    id: "demo-finding-05",
    engagementId: DEMO_VERIFICATION_ENGAGEMENT.id,
    type: "NONCONFORMITY",
    severity: "MINOR",
    title: "출장 데이터 범위 (Business travel boundary)",
    description: "Rail travel below 100 km is excluded from the travel data extract.",
    recommendation: "Extend the travel agent extract to cover all rail journeys.",
    status: "closed",
    dueDate: new Date(Date.UTC(2024, 11, 20)),
    resolvedAt: new Date(Date.UTC(2024, 11, 18)),
    misstatementAmount: 34,
  },
];

export type DemoEvidenceItem = {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly fileUrl: string;
  readonly fileType: string;
  readonly fileSize: number;
  readonly content: string;
};

export const DEMO_EVIDENCE_ITEMS: readonly DemoEvidenceItem[] = [
  {
    id: "demo-evidence-utility-bills",
    title: "2024 전력 청구서 묶음 (2024 electricity invoices)",
    type: "INVOICE",
    fileUrl: "https://example.com/hanbit-materials/evidence/2024-electricity-invoices.pdf",
    fileType: "application/pdf",
    fileSize: 2_418_311,
    content: "2024-electricity-invoices:36 invoices across three facilities",
  },
  {
    id: "demo-evidence-gas-meter",
    title: "울산 가스 계량기 검교정 성적서 (Ulsan gas meter calibration certificate)",
    type: "CALIBRATION",
    fileUrl: "https://example.com/hanbit-materials/evidence/ulsan-gas-meter-calibration.pdf",
    fileType: "application/pdf",
    fileSize: 412_006,
    content: "ulsan-gas-meter-calibration:2024-02-11, ultrasonic, within 0.5 %",
  },
  {
    id: "demo-evidence-ppa-contract",
    title: "울산 태양광 PPA 계약서 (Ulsan solar PPA contract)",
    type: "CONTRACT",
    fileUrl: "https://example.com/hanbit-materials/evidence/ulsan-solar-ppa.pdf",
    fileType: "application/pdf",
    fileSize: 1_204_882,
    content: "ulsan-solar-ppa:15-year physical PPA, 5,040 MWh/yr",
  },
  {
    id: "demo-evidence-irec",
    title: "I-REC 폐기 증명서 (I-REC retirement statement)",
    type: "CERTIFICATE",
    fileUrl: "https://example.com/hanbit-materials/evidence/irec-retirement-2024.pdf",
    fileType: "application/pdf",
    fileSize: 188_402,
    content: "irec-retirement-2024:1,440 MWh, IREC-KR-2024-000318",
  },
  {
    id: "demo-evidence-supplier-pcf",
    title: "협력사 PCF 선언서 (Supplier PCF declarations)",
    type: "DECLARATION",
    fileUrl: "https://example.com/hanbit-materials/evidence/supplier-pcf-2024.xlsx",
    fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileSize: 96_114,
    content: "supplier-pcf-2024:3 suppliers, ISO 14067, third-party verified",
  },
  {
    id: "demo-evidence-waste-tickets",
    title: "폐기물 계근표 (Waste weighbridge tickets)",
    type: "RECORD",
    fileUrl: "https://example.com/hanbit-materials/evidence/waste-tickets-2024.zip",
    fileType: "application/zip",
    fileSize: 3_991_204,
    content: "waste-tickets-2024:214 weighbridge tickets",
  },
];
