/**
 * XLSX export using exceljs.
 *
 * Produces a real Excel workbook with:
 * - A metadata sheet (organization, framework, year, completeness)
 * - One sheet per section with structured datapoints
 */

import ExcelJS from "exceljs";

import type { ExportInput } from "./types";

/**
 * Generate an XLSX buffer from the given export input.
 */
export async function generateXlsx(input: ExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CIOS";
  workbook.created = new Date();

  // Metadata sheet
  const metaSheet = workbook.addWorksheet("개요");
  metaSheet.columns = [
    { header: "항목", key: "field", width: 25 },
    { header: "값", key: "value", width: 50 },
  ];
  metaSheet.addRow({ field: "조직명", value: input.metadata.organizationName });
  metaSheet.addRow({ field: "프레임워크", value: input.metadata.framework });
  metaSheet.addRow({ field: "보고연도", value: input.metadata.reportingYear });
  metaSheet.addRow({ field: "생성일시", value: input.metadata.generatedAt });
  metaSheet.addRow({
    field: "완성도",
    value: `${input.metadata.completeness.toFixed(1)}%`,
  });

  // Style the header row
  metaSheet.getRow(1).font = { bold: true };

  // Data sheets per section
  for (const section of input.sections) {
    // Sanitize sheet name (max 31 chars, no special chars)
    const sheetName = section.title
      .replace(/[\\/*?[\]:]/g, "")
      .slice(0, 31);

    const sheet = workbook.addWorksheet(sheetName || "데이터");
    sheet.columns = [
      { header: "요구사항", key: "requirement", width: 50 },
      { header: "유형", key: "dataType", width: 12 },
      { header: "응답", key: "response", width: 40 },
      { header: "출처", key: "source", width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const row of section.rows) {
      sheet.addRow({
        requirement: row.requirement,
        dataType: row.dataType,
        response: row.response ?? "",
        source: row.source === "auto" ? "자동" : row.source === "narrative" ? "서술" : "미응답",
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
