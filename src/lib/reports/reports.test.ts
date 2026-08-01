/**
 * Report export tests.
 *
 * Verifies XLSX starts with PK bytes, PDF starts with %PDF-, DOCX starts with PK,
 * and all generated files are > 1KB.
 */

import { describe, expect, it } from "vitest";

import { buildExportInput } from "./disclosure-model";
import { generateDocx } from "./docx";
import { generatePdf } from "./pdf";
import { generateXlsx } from "./xlsx";
import type { ExportInput } from "./types";

const SAMPLE_INPUT: ExportInput = buildExportInput({
  organizationName: "테스트 조직",
  framework: "CDP",
  reportingYear: 2024,
  completeness: 75,
  locale: "ko",
  datapoints: [
    {
      requirementCode: "C6.1",
      title: "Scope 1 배출량",
      category: "배출량",
      dataType: "NUMERIC",
      value: 12345.67,
      source: "auto",
    },
    {
      requirementCode: "C6.3",
      title: "Scope 2 배출량 (위치기반)",
      category: "배출량",
      dataType: "NUMERIC",
      value: 8901.23,
      source: "auto",
    },
    {
      requirementCode: "C6.5",
      title: "Scope 3 배출량",
      category: "배출량",
      dataType: "NUMERIC",
      value: 45678.9,
      source: "auto",
    },
    {
      requirementCode: "C1.1a",
      title: "기후 관련 위험 식별 프로세스",
      category: "거버넌스",
      dataType: "TEXT",
      value: "이사회 수준의 기후 위험 감독 체계 운영",
      source: "narrative",
    },
    {
      requirementCode: "C3.1",
      title: "전략적 계획 기간",
      category: "전략",
      dataType: "TEXT",
      value: null,
      source: "pending",
    },
  ],
});

describe("XLSX export", () => {
  it("generates a valid XLSX file (PK zip header, > 1KB)", async () => {
    const buffer = await generateXlsx(SAMPLE_INPUT);
    expect(buffer.length).toBeGreaterThan(1024);
    // XLSX is a ZIP file: starts with PK (0x50, 0x4B)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("produces consistent output for the same input", async () => {
    const buffer1 = await generateXlsx(SAMPLE_INPUT);
    const buffer2 = await generateXlsx(SAMPLE_INPUT);
    // Both should be valid and similar size (timestamps may differ slightly)
    expect(Math.abs(buffer1.length - buffer2.length)).toBeLessThan(100);
  });
});

describe("PDF export", () => {
  it("generates a valid PDF file (%PDF- header, > 1KB)", async () => {
    const buffer = await generatePdf(SAMPLE_INPUT);
    expect(buffer.length).toBeGreaterThan(1024);
    // PDF starts with %PDF-
    const header = buffer.subarray(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("includes metadata in PDF", async () => {
    const buffer = await generatePdf(SAMPLE_INPUT);
    const content = buffer.toString("latin1");
    expect(content).toContain("CDP");
    expect(content).toContain("2024");
  });
});

describe("DOCX export", () => {
  it("generates a valid DOCX file (PK zip header, > 1KB)", async () => {
    const buffer = await generateDocx(SAMPLE_INPUT);
    expect(buffer.length).toBeGreaterThan(1024);
    // DOCX is a ZIP file: starts with PK (0x50, 0x4B)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});

describe("disclosure model adapter", () => {
  it("groups datapoints into sections by category", () => {
    expect(SAMPLE_INPUT.sections.length).toBe(3); // 배출량, 거버넌스, 전략
    const emissionsSection = SAMPLE_INPUT.sections.find(
      (s) => s.title === "배출량",
    );
    expect(emissionsSection).toBeDefined();
    expect(emissionsSection!.rows.length).toBe(3);
  });

  it("populates metadata correctly", () => {
    expect(SAMPLE_INPUT.metadata.organizationName).toBe("테스트 조직");
    expect(SAMPLE_INPUT.metadata.framework).toBe("CDP");
    expect(SAMPLE_INPUT.metadata.reportingYear).toBe(2024);
    expect(SAMPLE_INPUT.metadata.completeness).toBe(75);
  });
});
