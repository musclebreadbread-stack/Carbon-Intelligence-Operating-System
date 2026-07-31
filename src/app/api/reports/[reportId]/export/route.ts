/**
 * Report export endpoint.
 *
 * GET /api/reports/:reportId/export?format=xlsx|pdf|docx&locale=ko|en
 *
 * Generates a real file from the disclosure report data. In demo mode, the
 * report is computed from fixtures (same numbers the UI shows). The response
 * is streamed as the appropriate MIME type with a Content-Disposition header.
 *
 * Re-verifies tenant membership and permission before serving the file.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/rbac";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import {
  getAssembledReport,
  listDisclosureReports,
} from "@/lib/data/repositories/disclosure";
import { buildExportInput } from "@/lib/reports/disclosure-model";
import { generateDocx } from "@/lib/reports/docx";
import { generatePdf } from "@/lib/reports/pdf";
import { generateXlsx } from "@/lib/reports/xlsx";
import type { ExportFormat } from "@/lib/reports/types";

const MIME_TYPES: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const EXTENSIONS: Record<ExportFormat, string> = {
  xlsx: ".xlsx",
  pdf: ".pdf",
  docx: ".docx",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const format = (request.nextUrl.searchParams.get("format") ?? "xlsx") as ExportFormat;
  const locale = request.nextUrl.searchParams.get("locale") ?? "ko";

  if (!["xlsx", "pdf", "docx"].includes(format)) {
    return NextResponse.json(
      { error: "Invalid format. Must be xlsx, pdf, or docx." },
      { status: 400 },
    );
  }

  try {
    // Re-verify authentication and permission on the export route.
    const session = await requireSession();
    const organizationId = await activeOrganizationId();

    requirePermission(session, "disclosure", "read", { organizationId });

    // Find the report and verify tenant ownership.
    const reports = await listDisclosureReports(organizationId);
    const report = reports.find((r) => r.id === reportId);

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Assemble the full report data
    const assembled = await getAssembledReport(
      organizationId,
      report.framework,
      report.reportingYear,
    );

    if (!assembled) {
      return NextResponse.json({ error: "Could not assemble report" }, { status: 500 });
    }

    // Build export input with locale-appropriate titles
    const useKo = locale === "ko";
    const exportInput = buildExportInput({
      organizationName: report.name,
      framework: report.framework,
      reportingYear: report.reportingYear,
      completeness: assembled.completeness.percent,
      locale,
      datapoints: assembled.sections.flatMap((section) =>
        section.requirements.map((req) => ({
          requirementCode: req.code,
          title: useKo ? req.nameKo : req.name,
          category: useKo ? section.titleKo : section.title,
          dataType: req.dataType,
          value: req.value ?? (req.numericValue !== null ? req.numericValue : null),
          source: req.isAnswered
            ? (req.numericValue !== null ? "auto" as const : "narrative" as const)
            : "pending" as const,
        })),
      ),
    });

    // Generate the file
    let buffer: Buffer;
    switch (format) {
      case "xlsx":
        buffer = await generateXlsx(exportInput);
        break;
      case "pdf":
        buffer = await generatePdf(exportInput);
        break;
      case "docx":
        buffer = await generateDocx(exportInput);
        break;
    }

    const filename = `${report.framework}-${report.reportingYear}${EXTENSIONS[format]}`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": MIME_TYPES[format],
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("Report export error:", error);
    if (
      error instanceof Error &&
      (error.message.includes("Unauthorized") || error.message.includes("No session"))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 },
    );
  }
}
