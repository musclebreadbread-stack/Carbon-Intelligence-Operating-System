/**
 * Disclosure model adapter — transforms domain disclosure data into the
 * ExportInput format consumed by XLSX/PDF/DOCX generators.
 *
 * Pure TypeScript — no framework imports.
 */

import type { ExportInput, ReportMetadata, ReportRow, ReportSection } from "./types";

export interface DisclosureDatapoint {
  readonly requirementCode: string;
  readonly title: string;
  readonly category: string;
  readonly dataType: string;
  readonly value: string | number | null;
  readonly source: "auto" | "narrative" | "pending";
}

export interface DisclosureExportInput {
  readonly organizationName: string;
  readonly framework: string;
  readonly reportingYear: number;
  readonly completeness: number;
  readonly locale: string;
  readonly datapoints: readonly DisclosureDatapoint[];
}

/**
 * Build an ExportInput from raw disclosure datapoints.
 */
export function buildExportInput(input: DisclosureExportInput): ExportInput {
  const metadata: ReportMetadata = {
    organizationName: input.organizationName,
    framework: input.framework,
    reportingYear: input.reportingYear,
    generatedAt: new Date().toISOString(),
    completeness: input.completeness,
    locale: input.locale,
  };

  // Group by category
  const grouped = new Map<string, ReportRow[]>();
  for (const dp of input.datapoints) {
    const row: ReportRow = {
      requirement: `${dp.requirementCode} - ${dp.title}`,
      category: dp.category,
      dataType: dp.dataType,
      response: dp.value,
      source: dp.source,
    };
    const existing = grouped.get(dp.category);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(dp.category, [row]);
    }
  }

  const sections: ReportSection[] = [...grouped.entries()].map(
    ([title, rows]) => ({ title, rows }),
  );

  return { metadata, sections };
}
