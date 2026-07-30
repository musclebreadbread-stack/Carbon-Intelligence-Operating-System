import { describe, expect, it } from "vitest";

import { REPORTING_FRAMEWORKS, SCOPE3_CATEGORIES } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { frameworkDefinition } from "@/lib/reference/frameworks";

import type { InventoryTotals } from "../emissions/aggregate";

import {
  assembleReport,
  completeness,
  isAnswered,
  mapInventoryToRequirements,
  type DisclosureContext,
  type ResponseLike,
} from "./map";
import {
  DISCLOSURE_REQUIREMENTS,
  autoPopulatableRequirements,
  findRequirement,
  requirementsFor,
} from "./requirements";

const inventory: InventoryTotals = {
  scope1Total: 12_000,
  scope2Location: 8_000,
  scope2Market: 6_500,
  scope3Total: 55_000,
  scope3ByCategory: {
    CAT_1_PURCHASED_GOODS: 30_000,
    CAT_4_UPSTREAM_TRANSPORT: 15_000,
    CAT_6_BUSINESS_TRAVEL: 10_000,
  },
  totalEmissions: 75_000,
  scope2Basis: "LOCATION",
  biogenicCO2: 350,
  unit: "tCO2e",
  resultCount: 42,
};

const context: DisclosureContext = {
  inventory,
  reportingYear: 2024,
  gwpVersion: "AR6",
  consolidationApproach: "OPERATIONAL_CONTROL",
  revenue: 1_500_000_000,
  energyConsumption: 120_000,
  renewableShare: 0.32,
  internalCarbonPrice: 75,
  retiredCredits: 2_000,
  baseYear: 2020,
  baseYearEmissions: 90_000,
};

describe("requirement catalogue integrity", () => {
  it("uses only requirement-group codes the framework declares", () => {
    for (const requirement of DISCLOSURE_REQUIREMENTS) {
      const groups = frameworkDefinition(requirement.framework).requirementGroups.map(
        (group) => group.code,
      );
      expect(groups, `${requirement.framework} ${requirement.code}`).toContain(
        requirement.category,
      );
    }
  });

  it("has a unique code per framework", () => {
    for (const framework of REPORTING_FRAMEWORKS) {
      const codes = requirementsFor(framework).map((requirement) => requirement.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("declares a Korean and English name plus a description for every requirement", () => {
    for (const requirement of DISCLOSURE_REQUIREMENTS) {
      expect(requirement.name.length).toBeGreaterThan(0);
      expect(requirement.nameKo.length).toBeGreaterThan(0);
      expect(requirement.description.length).toBeGreaterThan(0);
    }
  });

  it("covers all 15 Scope 3 categories in the CDP category rows", () => {
    const rows = requirementsFor("CDP").filter(
      (requirement) => requirement.metric === "scope3Category",
    );
    expect(rows).toHaveLength(15);
    expect(new Set(rows.map((row) => row.scope3Category))).toEqual(
      new Set(SCOPE3_CATEGORIES),
    );
  });

  it("catalogues requirements for every framework the plan calls out", () => {
    for (const framework of [
      "GHG_PROTOCOL",
      "ISO_14064",
      "CDP",
      "ISSB_S1",
      "ISSB_S2",
      "CSRD",
      "ESRS",
      "TCFD",
      "GRI",
      "SASB",
    ] as const) {
      expect(requirementsFor(framework).length).toBeGreaterThan(0);
    }
    // TNFD is nature-related and carries no GHG datapoints.
    expect(requirementsFor("TNFD")).toEqual([]);
  });

  it("finds a requirement by code and lists the auto-populatable ones", () => {
    expect(findRequirement("CDP", "C6.1")?.metric).toBe("scope1Total");
    expect(findRequirement("CDP", "nope")).toBeUndefined();
    const auto = autoPopulatableRequirements("ESRS");
    expect(auto.every((requirement) => requirement.metric !== undefined)).toBe(true);
    expect(auto.length).toBeLessThan(requirementsFor("ESRS").length);
  });
});

describe("mapInventoryToRequirements", () => {
  it("lands the scope totals on the correct CDP codes", () => {
    const result = mapInventoryToRequirements(context, "CDP");
    const byCode = new Map(result.responses.map((r) => [r.requirementCode, r]));
    expect(byCode.get("C6.1")?.numericValue).toBe(12_000);
    expect(byCode.get("C6.3")?.numericValue).toBe(8_000);
    expect(byCode.get("C6.3b")?.numericValue).toBe(6_500);
    expect(byCode.get("C6.5")?.numericValue).toBe(55_000);
    expect(byCode.get("C6.7")?.numericValue).toBe(350);
    expect(byCode.get("C6.1")?.value).toBe("12000 tCO2e");
    expect(byCode.get("C6.1")?.status).toBe("DRAFT");
    expect(byCode.get("C6.1")?.isAutoPopulated).toBe(true);
    expect(byCode.get("C6.1")?.notes).toContain("Auto-populated");
  });

  it("lands the scope totals on the correct ESRS E1 codes", () => {
    const result = mapInventoryToRequirements(context, "ESRS");
    const byCode = new Map(result.responses.map((r) => [r.requirementCode, r]));
    expect(byCode.get("E1-6-1")?.numericValue).toBe(12_000);
    expect(byCode.get("E1-6-2")?.numericValue).toBe(8_000);
    expect(byCode.get("E1-6-3")?.numericValue).toBe(6_500);
    expect(byCode.get("E1-6-4")?.numericValue).toBe(55_000);
    expect(byCode.get("E1-6-5")?.numericValue).toBe(75_000);
    expect(byCode.get("E1-7")?.numericValue).toBe(2_000);
    expect(byCode.get("E1-8")?.numericValue).toBe(75);
  });

  it("populates the per-category Scope 3 rows that have data", () => {
    const result = mapInventoryToRequirements(context, "CDP");
    const byCode = new Map(result.responses.map((r) => [r.requirementCode, r]));
    expect(byCode.get("C6.5-1")?.numericValue).toBe(30_000);
    expect(byCode.get("C6.5-4")?.numericValue).toBe(15_000);
    expect(byCode.get("C6.5-6")?.numericValue).toBe(10_000);
    // Category 2 has no results, so it stays unanswered rather than showing 0.
    expect(byCode.get("C6.5-2")?.numericValue).toBeNull();
    expect(result.unavailableCodes).toContain("C6.5-2");
  });

  it("derives revenue intensity and the renewable percentage", () => {
    const result = mapInventoryToRequirements(context, "ESRS");
    const byCode = new Map(result.responses.map((r) => [r.requirementCode, r]));
    expect(byCode.get("E1-6-6")?.numericValue).toBeCloseTo(
      Number((75_000 / 1_500_000_000).toFixed(3)),
      9,
    );
    expect(byCode.get("E1-5-RENEWABLE")?.numericValue).toBe(32);
    expect(byCode.get("E1-5")?.numericValue).toBe(120_000);
  });

  it("carries text metrics through as values, not numbers", () => {
    const result = mapInventoryToRequirements(context, "CDP");
    const byCode = new Map(result.responses.map((r) => [r.requirementCode, r]));
    expect(byCode.get("C5.3")).toMatchObject({ value: "AR6", numericValue: null });
    expect(byCode.get("C6.2")).toMatchObject({ value: "LOCATION", numericValue: null });
    expect(byCode.get("C5.1")).toMatchObject({ value: "2020", numericValue: 2020 });
  });

  it("leaves narrative requirements unanswered and lists them", () => {
    const result = mapInventoryToRequirements(context, "CDP");
    expect(result.narrativeCodes).toContain("C1.1a");
    const narrative = result.responses.find((r) => r.requirementCode === "C1.1a");
    expect(narrative).toMatchObject({
      value: null,
      numericValue: null,
      status: "NOT_STARTED",
      isAutoPopulated: false,
    });
    expect(narrative?.notes).toContain("requires input from the reporting team");
  });

  it("marks metrics the context cannot supply as unavailable", () => {
    const sparse = mapInventoryToRequirements(
      { inventory, reportingYear: 2024 },
      "ESRS",
    );
    expect(sparse.unavailableCodes).toContain("E1-6-6"); // no revenue
    expect(sparse.unavailableCodes).toContain("E1-5"); // no energy consumption
    expect(sparse.populatedCodes).toContain("E1-6-1"); // scope totals still land
  });

  it("emits exactly one response per catalogued requirement", () => {
    const result = mapInventoryToRequirements(context, "GRI");
    expect(result.responses).toHaveLength(requirementsFor("GRI").length);
    expect(
      result.populatedCodes.length +
        result.unavailableCodes.length +
        result.narrativeCodes.length,
    ).toBe(result.responses.length);
  });

  it("rejects a framework with no catalogued requirements", () => {
    expect(() => mapInventoryToRequirements(context, "TNFD")).toThrow(CalculationError);
  });
});

describe("completeness", () => {
  const requirements = requirementsFor("TCFD");

  it("reports 100 % when every mandatory item is answered", () => {
    const responses: ResponseLike[] = requirements.map((requirement) => ({
      requirementCode: requirement.code,
      value: "answered",
      status: "DRAFT",
    }));
    const report = completeness(responses, requirements);
    expect(report.percent).toBe(100);
    expect(report.mandatoryPercent).toBe(100);
    expect(report.unansweredMandatory).toEqual([]);
    expect(report.isComplete).toBe(true);
  });

  it("lists the exact mandatory gaps", () => {
    const responses: ResponseLike[] = requirements
      .filter((requirement) => requirement.category === "TCFD-MT")
      .map((requirement) => ({
        requirementCode: requirement.code,
        numericValue: 1,
        status: "DRAFT",
      }));
    const report = completeness(responses, requirements);
    expect(report.isComplete).toBe(false);
    expect(report.unansweredMandatory.map((gap) => gap.code)).toEqual([
      "TCFD-GOV-a",
      "TCFD-STR-c",
      "TCFD-RM-a",
    ]);
    expect(report.unansweredMandatory.every((gap) => gap.isMandatory)).toBe(true);
  });

  it("scores each requirement group separately", () => {
    const responses: ResponseLike[] = [
      { requirementCode: "TCFD-GOV-a", value: "yes", status: "DRAFT" },
    ];
    const report = completeness(responses, requirements);
    const gov = report.byCategory.find((entry) => entry.category === "TCFD-GOV");
    const metrics = report.byCategory.find((entry) => entry.category === "TCFD-MT");
    expect(gov).toMatchObject({ total: 1, answered: 1, percent: 100, mandatoryPercent: 100 });
    expect(metrics).toMatchObject({ answered: 0, percent: 0, mandatoryPercent: 0 });
  });

  it("ignores optional items when scoring mandatory completeness", () => {
    const responses: ResponseLike[] = requirements
      .filter((requirement) => requirement.isMandatory)
      .map((requirement) => ({
        requirementCode: requirement.code,
        value: "answered",
        status: "DRAFT",
      }));
    const report = completeness(responses, requirements);
    expect(report.mandatoryPercent).toBe(100);
    expect(report.isComplete).toBe(true);
    expect(report.percent).toBeLessThan(100);
    expect(report.unanswered.map((gap) => gap.code)).toEqual(["TCFD-MT-b-3"]);
  });

  it("does not count a NOT_STARTED or blank response as answered", () => {
    const report = completeness(
      [
        { requirementCode: "TCFD-GOV-a", value: "text", status: "NOT_STARTED" },
        { requirementCode: "TCFD-STR-c", value: "   ", status: "DRAFT" },
        { requirementCode: "TCFD-RM-a", value: null, numericValue: null, status: "DRAFT" },
      ],
      requirements,
    );
    expect(report.answered).toBe(0);
    expect(isAnswered({ requirementCode: "x", numericValue: 0, status: "DRAFT" })).toBe(true);
    expect(isAnswered(undefined)).toBe(false);
  });

  it("reports responses whose code is not in the catalogue", () => {
    const report = completeness(
      [{ requirementCode: "MADE-UP", value: "x", status: "DRAFT" }],
      requirements,
    );
    expect(report.orphanResponseCodes).toEqual(["MADE-UP"]);
  });

  it("requires at least one requirement", () => {
    expect(() => completeness([], [])).toThrow(CalculationError);
  });

  it("scores an auto-populated ESRS mapping without any narrative work", () => {
    const mapping = mapInventoryToRequirements(context, "ESRS");
    const report = completeness(mapping.responses, requirementsFor("ESRS"));
    expect(report.answered).toBe(mapping.populatedCodes.length);
    expect(report.isComplete).toBe(false);
    expect(report.unansweredMandatory.map((gap) => gap.code)).toContain("E1-1");
  });
});

describe("assembleReport", () => {
  const mapping = mapInventoryToRequirements(context, "ESRS");

  it("builds a section per requirement group that has requirements", () => {
    const report = assembleReport("ESRS", mapping.responses, context);
    expect(report.sections.map((section) => section.code)).toEqual(["ESRS2", "E1"]);
    expect(report.sections[1].title).toBe("Climate change");
    expect(report.sections[1].titleKo).toBe("기후변화");
    expect(report.sections.map((section) => section.orderIndex)).toEqual([0, 1]);
  });

  it("carries the response values onto the requirement rows", () => {
    const report = assembleReport("ESRS", mapping.responses, context);
    const e1 = report.sections.find((section) => section.code === "E1");
    const scope1 = e1?.requirements.find((row) => row.code === "E1-6-1");
    expect(scope1).toMatchObject({
      numericValue: 12_000,
      unit: "tCO2e",
      status: "DRAFT",
      isAnswered: true,
      isMandatory: true,
    });
    expect(scope1?.nameKo).toBe("총 Scope 1 온실가스 배출량");
    const transition = e1?.requirements.find((row) => row.code === "E1-1");
    expect(transition).toMatchObject({ isAnswered: false, status: "NOT_STARTED" });
  });

  it("repeats the headline inventory figures for the cover page", () => {
    const report = assembleReport("ESRS", mapping.responses, context);
    expect(report.headline).toEqual({
      scope1: 12_000,
      scope2Location: 8_000,
      scope2Market: 6_500,
      scope3: 55_000,
      total: 75_000,
      unit: "tCO2e",
    });
    expect(report.name).toContain("2024");
    expect(report.publisher).toBe("EFRAG");
  });

  it("derives the report status from mandatory completeness", () => {
    const partial = assembleReport("ESRS", mapping.responses, context);
    expect(partial.status).toBe("IN_PROGRESS");

    const empty = assembleReport("ESRS", [], context);
    expect(empty.status).toBe("NOT_STARTED");

    const full = assembleReport(
      "ESRS",
      requirementsFor("ESRS").map((requirement) => ({
        requirementCode: requirement.code,
        value: "answered",
        status: "DRAFT" as const,
      })),
      context,
    );
    expect(full.status).toBe("REVIEW");
    expect(full.completeness.isComplete).toBe(true);
  });

  it("attaches the per-group completeness to each section", () => {
    const report = assembleReport("ESRS", mapping.responses, context);
    const e1 = report.sections.find((section) => section.code === "E1");
    expect(e1?.completeness?.category).toBe("E1");
    expect(e1?.completeness?.total).toBe(
      requirementsFor("ESRS").filter((r) => r.category === "E1").length,
    );
  });

  it("assembles every catalogued framework without throwing", () => {
    for (const framework of REPORTING_FRAMEWORKS) {
      if (requirementsFor(framework).length === 0) continue;
      const result = mapInventoryToRequirements(context, framework);
      const report = assembleReport(framework, result.responses, context);
      expect(report.sections.length).toBeGreaterThan(0);
      expect(
        report.sections.reduce((total, section) => total + section.requirements.length, 0),
      ).toBe(requirementsFor(framework).length);
    }
  });
});
