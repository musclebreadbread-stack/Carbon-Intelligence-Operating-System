/**
 * Demo tenant: disclosure frameworks, reports and the narrative responses a human
 * has to author.
 *
 * The framework and requirement catalogue itself is the item-21 constant
 * `DISCLOSURE_REQUIREMENTS`, so this fixture only carries the tenant's reports and
 * the *narrative* answers. Every numeric datapoint is auto-populated by
 * `mapInventoryToRequirements` from the calculated inventory, which is why there
 * are no hardcoded numbers here.
 */

import type { DisclosureStatus, ReportingFramework } from "@/lib/core/enums";
import {
  DISCLOSURE_REQUIREMENTS,
  requirementsFor,
} from "@/lib/domain/disclosure/requirements";

import { DEMO_CURRENT_YEAR } from "./activity-data";
import { DEMO_ORGANIZATION_ID } from "./organization";

/** Frameworks the demo tenant reports against, in submission order. */
export const DEMO_DISCLOSURE_FRAMEWORKS: readonly ReportingFramework[] = [
  "CDP",
  "ISSB_S2",
  "ESRS",
  "TCFD",
  "GRI",
  "SASB",
];

export type DemoDisclosureFrameworkRow = {
  readonly id: string;
  readonly code: ReportingFramework;
  readonly name: string;
  readonly version: string;
  readonly publisher: string;
  readonly url: string;
  readonly isActive: boolean;
  readonly requirementCount: number;
};

const FRAMEWORK_METADATA: Readonly<
  Record<string, { name: string; version: string; publisher: string; url: string }>
> = {
  CDP: {
    name: "CDP Climate Change Questionnaire",
    version: "2024",
    publisher: "CDP Worldwide",
    url: "https://www.cdp.net/en/guidance",
  },
  ISSB_S1: {
    name: "IFRS S1 General Requirements",
    version: "2023",
    publisher: "International Sustainability Standards Board",
    url: "https://www.ifrs.org/issued-standards/ifrs-sustainability-standards-navigator/",
  },
  ISSB_S2: {
    name: "IFRS S2 Climate-related Disclosures",
    version: "2023",
    publisher: "International Sustainability Standards Board",
    url: "https://www.ifrs.org/issued-standards/ifrs-sustainability-standards-navigator/",
  },
  ESRS: {
    name: "ESRS E1 Climate Change",
    version: "2023",
    publisher: "European Financial Reporting Advisory Group",
    url: "https://www.efrag.org/en/sustainability-reporting",
  },
  CSRD: {
    name: "Corporate Sustainability Reporting Directive",
    version: "2022/2464",
    publisher: "European Commission",
    url: "https://finance.ec.europa.eu/capital-markets-union-and-financial-markets/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en",
  },
  TCFD: {
    name: "TCFD Recommendations",
    version: "2021",
    publisher: "Task Force on Climate-related Financial Disclosures",
    url: "https://www.fsb-tcfd.org/publications/",
  },
  GRI: {
    name: "GRI 305: Emissions",
    version: "2016",
    publisher: "Global Reporting Initiative",
    url: "https://www.globalreporting.org/standards/",
  },
  SASB: {
    name: "SASB Chemicals Standard",
    version: "2023",
    publisher: "IFRS Foundation / SASB",
    url: "https://sasb.ifrs.org/standards/",
  },
  GHG_PROTOCOL: {
    name: "GHG Protocol Corporate Standard",
    version: "Revised edition",
    publisher: "World Resources Institute / WBCSD",
    url: "https://ghgprotocol.org/corporate-standard",
  },
  ISO_14064: {
    name: "ISO 14064-1 GHG quantification and reporting",
    version: "2018",
    publisher: "International Organization for Standardization",
    url: "https://www.iso.org/standard/66453.html",
  },
  TNFD: {
    name: "TNFD Recommendations",
    version: "v1.0",
    publisher: "Taskforce on Nature-related Financial Disclosures",
    url: "https://tnfd.global/publications/",
  },
};

export const DEMO_DISCLOSURE_FRAMEWORK_ROWS: readonly DemoDisclosureFrameworkRow[] = [
  ...new Set(DISCLOSURE_REQUIREMENTS.map((requirement) => requirement.framework)),
].map((code) => {
  const metadata = FRAMEWORK_METADATA[code];
  return {
    id: `demo-framework-${code.toLowerCase().replace(/_/g, "-")}`,
    code,
    name: metadata.name,
    version: metadata.version,
    publisher: metadata.publisher,
    url: metadata.url,
    isActive: true,
    requirementCount: requirementsFor(code).length,
  };
});

export type DemoDisclosureReport = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly framework: ReportingFramework;
  readonly reportingYear: number;
  readonly status: DisclosureStatus;
  readonly submittedAt: Date | null;
  readonly publishedAt: Date | null;
  readonly dueDate: Date;
  readonly notes: string;
  readonly createdById: string;
};

export const DEMO_DISCLOSURE_REPORTS: readonly DemoDisclosureReport[] = [
  {
    id: "demo-report-cdp-2024",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "CDP 기후변화 2024 (CDP Climate Change 2024)",
    framework: "CDP",
    reportingYear: DEMO_CURRENT_YEAR,
    status: "IN_PROGRESS",
    submittedAt: null,
    publishedAt: null,
    dueDate: new Date(Date.UTC(2025, 5, 11)),
    notes: "Numeric datapoints auto-populated from the 2024 inventory; narrative in review.",
    createdById: "demo-user-admin",
  },
  {
    id: "demo-report-issb-2024",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "IFRS S2 기후 공시 2024 (IFRS S2 climate disclosure 2024)",
    framework: "ISSB_S2",
    reportingYear: DEMO_CURRENT_YEAR,
    status: "DRAFT",
    submittedAt: null,
    publishedAt: null,
    dueDate: new Date(Date.UTC(2025, 2, 31)),
    notes: "First-year adoption; transition reliefs applied to Scope 3 comparatives.",
    createdById: "demo-user-admin",
  },
  {
    id: "demo-report-esrs-2024",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "ESRS E1 기후변화 2024 (ESRS E1 climate change 2024)",
    framework: "ESRS",
    reportingYear: DEMO_CURRENT_YEAR,
    status: "REVIEW",
    submittedAt: null,
    publishedAt: null,
    dueDate: new Date(Date.UTC(2025, 3, 30)),
    notes: "Filed by the EU subsidiary; double materiality assessment attached.",
    createdById: "demo-user-analyst",
  },
  {
    id: "demo-report-tcfd-2023",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "TCFD 보고서 2023 (TCFD report 2023)",
    framework: "TCFD",
    reportingYear: 2023,
    status: "PUBLISHED",
    submittedAt: new Date(Date.UTC(2024, 4, 20)),
    publishedAt: new Date(Date.UTC(2024, 5, 3)),
    dueDate: new Date(Date.UTC(2024, 5, 30)),
    notes: "Published alongside the 2023 annual report.",
    createdById: "demo-user-admin",
  },
  {
    id: "demo-report-gri-2023",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "GRI 305 배출 2023 (GRI 305 emissions 2023)",
    framework: "GRI",
    reportingYear: 2023,
    status: "PUBLISHED",
    submittedAt: new Date(Date.UTC(2024, 4, 20)),
    publishedAt: new Date(Date.UTC(2024, 5, 3)),
    dueDate: new Date(Date.UTC(2024, 5, 30)),
    notes: "Included in the 2023 sustainability report.",
    createdById: "demo-user-analyst",
  },
];

/**
 * Narrative answers a person has authored. Numeric datapoints are deliberately
 * absent: they come from the inventory, not from this fixture.
 */
export type DemoNarrativeResponse = {
  readonly id: string;
  readonly reportId: string;
  readonly framework: ReportingFramework;
  readonly requirementCode: string;
  readonly value: string;
  readonly status: DisclosureStatus;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
};

export const DEMO_NARRATIVE_RESPONSES: readonly DemoNarrativeResponse[] = (() => {
  const narrativeByFramework = new Map<ReportingFramework, string[]>();
  for (const requirement of DISCLOSURE_REQUIREMENTS) {
    if (requirement.dataType === "NUMERIC") continue;
    if (!requirement.isMandatory) continue;
    const codes = narrativeByFramework.get(requirement.framework) ?? [];
    // Two authored narratives per framework keeps the completeness view honest:
    // partially answered rather than either empty or artificially complete.
    if (codes.length >= 2) continue;
    codes.push(requirement.code);
    narrativeByFramework.set(requirement.framework, codes);
  }

  return DEMO_DISCLOSURE_REPORTS.flatMap((report) =>
    (narrativeByFramework.get(report.framework) ?? []).map((code, index) => ({
      id: `demo-response-${report.id}-${code.replace(/[^A-Za-z0-9]/g, "-")}`,
      reportId: report.id,
      framework: report.framework,
      requirementCode: code,
      value:
        "한빛소재는 기후 관련 위험과 기회를 전사 리스크 관리 체계에 통합하여 이사회 지속가능경영위원회에 분기별로 보고합니다. " +
        "Hanbit Materials integrates climate-related risks and opportunities into enterprise risk management and reports quarterly to the Board Sustainability Committee.",
      status: report.status === "PUBLISHED" ? "PUBLISHED" : "IN_PROGRESS",
      reviewedBy: index === 0 ? "demo-user-admin" : null,
      reviewedAt: index === 0 ? new Date(Date.UTC(2025, 0, 15)) : null,
    })),
  );
})();
