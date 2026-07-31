/**
 * Report export types.
 *
 * Shared type definitions for the XLSX, PDF, and DOCX export modules.
 * Pure TypeScript — no framework imports.
 */

export type ExportFormat = "xlsx" | "pdf" | "docx";

export interface ReportSection {
  readonly title: string;
  readonly rows: readonly ReportRow[];
}

export interface ReportRow {
  readonly requirement: string;
  readonly category: string;
  readonly dataType: string;
  readonly response: string | number | null;
  readonly source: "auto" | "narrative" | "pending";
}

export interface ReportMetadata {
  readonly organizationName: string;
  readonly framework: string;
  readonly reportingYear: number;
  readonly generatedAt: string;
  readonly completeness: number;
  readonly locale: string;
}

export interface ExportInput {
  readonly metadata: ReportMetadata;
  readonly sections: readonly ReportSection[];
}
