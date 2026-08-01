/**
 * PDF export using pdfkit.
 *
 * Produces a structured PDF report with:
 * - Cover page with metadata
 * - Section-based datapoints
 *
 * Embeds the NotoSansKR font for full Korean character support.
 */

import { resolve } from "path";

import PDFDocument from "pdfkit";

import type { ExportInput } from "./types";

/** Path to the Korean font, resolved at build time. */
const KOREAN_FONT_PATH = resolve(
  process.cwd(),
  "public/fonts/NotoSansKR-KSX1001.ttf",
);

/**
 * Generate a PDF buffer from the given export input.
 */
export async function generatePdf(input: ExportInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `${input.metadata.framework} Report - ${input.metadata.reportingYear}`,
          Author: "CIOS - Carbon Intelligence Operating System",
          Subject: "ESG Disclosure Report",
          Creator: "CIOS",
        },
      });

      // Register the Korean font for CJK glyph rendering.
      try {
        doc.registerFont("NotoSansKR", KOREAN_FONT_PATH);
        doc.font("NotoSansKR");
      } catch {
        // Fall back to built-in Helvetica when the font file is unavailable
        // (e.g., in test environments).
        doc.font("Helvetica");
      }

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Cover page
      doc.fontSize(24).text("ESG Disclosure Report", { align: "center" });
      doc.moveDown(2);
      doc.fontSize(14).text(input.metadata.framework, { align: "center" });
      doc.moveDown(1);
      doc.fontSize(11);
      doc.text(`Organization: ${input.metadata.organizationName}`);
      doc.text(`Reporting Year: ${input.metadata.reportingYear}`);
      doc.text(`Generated: ${input.metadata.generatedAt}`);
      doc.text(
        `Completeness: ${input.metadata.completeness.toFixed(1)}%`,
      );
      doc.moveDown(2);

      // Sections
      for (const section of input.sections) {
        doc.addPage();
        doc.fontSize(16).text(section.title, { underline: true });
        doc.moveDown(1);

        for (const row of section.rows) {
          doc.fontSize(10);
          doc.text(row.requirement, { continued: false });
          const responseText =
            row.response !== null && row.response !== undefined
              ? String(row.response)
              : "(pending)";
          doc.text(`  Response: ${responseText}`, { indent: 20 });
          doc.text(
            `  Source: ${row.source === "auto" ? "Automated" : row.source === "narrative" ? "Narrative" : "Pending"}`,
            { indent: 20 },
          );
          doc.moveDown(0.5);

          // Page break if near bottom
          if (doc.y > 700) {
            doc.addPage();
          }
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
