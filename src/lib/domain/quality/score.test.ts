import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";
import { sum } from "@/lib/core/number";
import { calendarYear, createPeriod } from "@/lib/core/period";

import {
  QUALITY_DIMENSIONS,
  QUALITY_WEIGHTS,
  aggregateQuality,
  scoreEntry,
  toDataQualityScoreRecord,
  type QualityScoreInput,
} from "./score";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const reportingPeriod = calendarYear(2024);

const bestCase: QualityScoreInput = {
  reportingPeriod,
  dataPeriod: calendarYear(2024),
  measurementType: "METERED",
  factorSpecificity: "SUPPLIER_SPECIFIC",
  factorPublishedYear: 2024,
  requiredFields: ["quantity", "unit"],
  providedFields: ["quantity", "unit"],
  hasEvidence: true,
};

const worstCase: QualityScoreInput = {
  reportingPeriod,
  dataPeriod: calendarYear(2021),
  measurementType: "ESTIMATED",
  factorSpecificity: "GLOBAL",
  factorUncertainty: 0.3,
  factorPublishedYear: 2019,
  requiredFields: ["quantity", "unit", "supplierId"],
  providedFields: ["quantity"],
  hasEvidence: false,
  sourceConsistentWithPriorPeriod: false,
};

describe("rubric definition", () => {
  it("has weights over all five dimensions summing to 1", () => {
    expect(Object.keys(QUALITY_WEIGHTS).sort()).toEqual([...QUALITY_DIMENSIONS].sort());
    expect(sum(QUALITY_DIMENSIONS.map((d) => QUALITY_WEIGHTS[d]))).toBeCloseTo(1, 12);
  });
});

describe("scoreEntry", () => {
  it("scores a metered current-period entry with a supplier-specific factor as HIGH", () => {
    const score = scoreEntry(bestCase);
    expect(score.reliability).toBe(100);
    expect(score.accuracy).toBe(90);
    expect(score.completeness).toBe(100);
    expect(score.timeliness).toBe(100);
    expect(score.consistency).toBe(100);
    // 100×0.3 + 90×0.25 + 100×0.2 + 100×0.15 + 100×0.1 = 97.5
    expect(score.overallScore).toBeCloseTo(97.5, 9);
    expect(score.level).toBe("HIGH");
    expect(score.rationale).toHaveLength(5);
  });

  it("scores an estimated stale entry with a global default factor as ESTIMATED or DEFAULT", () => {
    const score = scoreEntry(worstCase);
    expect(score.overallScore).toBeLessThan(30);
    expect(["ESTIMATED", "DEFAULT"]).toContain(score.level);
    expect(score.reliability).toBe(35); // ESTIMATED 45 − 10 for no evidence
    expect(score.accuracy).toBe(5); // GLOBAL 35 − 30 for ±30 % factor uncertainty
    expect(score.completeness).toBe(0); // no overlap with the reporting period
  });

  it("lands an invoiced country-average entry in the HIGH band", () => {
    const score = scoreEntry({
      reportingPeriod,
      dataPeriod: calendarYear(2024),
      measurementType: "INVOICED",
      factorSpecificity: "COUNTRY",
      factorUncertainty: 0.05,
      factorPublishedYear: 2023,
      requiredFields: ["quantity", "unit"],
      providedFields: ["quantity", "unit"],
    });
    // 85×0.3 + 65×0.25 + 100×0.2 + 92.5×0.15 + 100×0.1 = 85.625
    expect(score.overallScore).toBeCloseTo(85.625, 9);
    expect(score.level).toBe("HIGH");
  });

  it("lands a calculated, partially covered regional entry in the MEDIUM band", () => {
    const score = scoreEntry({
      reportingPeriod,
      dataPeriod: createPeriod(utc("2024-01-01"), utc("2024-09-30")),
      measurementType: "CALCULATED",
      factorSpecificity: "REGION",
      factorUncertainty: 0.1,
      factorPublishedYear: 2022,
      requiredFields: ["quantity", "unit"],
      providedFields: ["quantity", "unit"],
    });
    // reliability 70, accuracy 45, completeness 274/366×100, timeliness 85, consistency 100
    expect(score.reliability).toBe(70);
    expect(score.accuracy).toBe(45);
    expect(score.completeness).toBeCloseTo((274 / 366) * 100, 9);
    expect(score.timeliness).toBe(85);
    expect(score.overallScore).toBeCloseTo(69.9726776, 6);
    expect(score.level).toBe("MEDIUM");
  });

  it("caps reliability at the estimated band when isEstimated is set", () => {
    const score = scoreEntry({ ...bestCase, isEstimated: true });
    expect(score.reliability).toBe(45);
    expect(score.rationale[0]).toContain("capped at the ESTIMATED band");
  });

  it("penalises a missing evidence attachment", () => {
    const withEvidence = scoreEntry(bestCase);
    const withoutEvidence = scoreEntry({ ...bestCase, hasEvidence: false });
    expect(withoutEvidence.reliability).toBe(withEvidence.reliability - 10);
    expect(withoutEvidence.rationale.some((r) => r.includes("no supporting evidence"))).toBe(true);
  });

  it("ranks factor specificity monotonically through the accuracy dimension", () => {
    const scores = (
      ["ORGANIZATION_SPECIFIC", "SUPPLIER_SPECIFIC", "COUNTRY", "REGION", "GLOBAL"] as const
    ).map((factorSpecificity) => scoreEntry({ ...bestCase, factorSpecificity }).accuracy);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(scores.length);
  });

  it("caps the factor-uncertainty penalty at 40 points", () => {
    const heavy = scoreEntry({ ...bestCase, factorUncertainty: 2 });
    expect(heavy.accuracy).toBe(50); // 90 − 40, not 90 − 200
  });

  it("prorates completeness by the share of the reporting period covered", () => {
    const halfYear = scoreEntry({
      ...bestCase,
      dataPeriod: createPeriod(utc("2024-01-01"), utc("2024-06-30")),
    });
    // 182 of 366 days ≈ 49.7 %
    expect(halfYear.completeness).toBeCloseTo((182 / 366) * 100, 6);
  });

  it("reduces completeness for missing required fields", () => {
    const missing = scoreEntry({
      ...bestCase,
      requiredFields: ["quantity", "unit", "supplierId", "invoiceRef"],
      providedFields: ["quantity", "unit"],
    });
    expect(missing.completeness).toBe(50);
    expect(missing.rationale.some((r) => r.includes("missing required field"))).toBe(true);
  });

  it("decays timeliness with factor age and data offset", () => {
    const current = scoreEntry({ ...bestCase, factorPublishedYear: 2024 });
    const twoYearsOld = scoreEntry({ ...bestCase, factorPublishedYear: 2022 });
    expect(current.timeliness).toBe(100);
    expect(twoYearsOld.timeliness).toBe(85); // mean(100 − 30, 100)
    const unknownVintage = scoreEntry({ ...bestCase, factorPublishedYear: null });
    expect(unknownVintage.timeliness).toBe(80); // mean(60, 100)
    expect(unknownVintage.rationale.some((r) => r.includes("publication year unknown"))).toBe(true);
  });

  it("does not reward a factor published after the reporting year", () => {
    expect(scoreEntry({ ...bestCase, factorPublishedYear: 2030 }).timeliness).toBe(100);
  });

  it("deducts a third of consistency per inconsistency", () => {
    const oneIssue = scoreEntry({ ...bestCase, unitConsistent: false });
    const allIssues = scoreEntry({
      ...bestCase,
      unitConsistent: false,
      sourceConsistentWithPriorPeriod: false,
      methodConsistentWithPriorPeriod: false,
    });
    expect(oneIssue.consistency).toBeCloseTo(66.6667, 3);
    expect(allIssues.consistency).toBe(0);
    expect(allIssues.rationale.some((r) => r.includes("calculation method changed"))).toBe(true);
  });

  it("rejects unknown rubric inputs", () => {
    expect(() =>
      scoreEntry({ ...bestCase, measurementType: "GUESSED" as never }),
    ).toThrow(CalculationError);
    expect(() =>
      scoreEntry({ ...bestCase, factorSpecificity: "COSMIC" as never }),
    ).toThrow(/factor specificity/);
  });
});

describe("aggregateQuality", () => {
  it("weights entry scores by the emissions they represent", () => {
    const high = scoreEntry(bestCase);
    const low = scoreEntry(worstCase);
    // 9000 tCO2e of good data against 1000 tCO2e of bad data.
    const aggregate = aggregateQuality([
      { score: high, weight: 9000 },
      { score: low, weight: 1000 },
    ]);
    expect(aggregate.entryCount).toBe(2);
    expect(aggregate.overallScore).toBeCloseTo(
      high.overallScore * 0.9 + low.overallScore * 0.1,
      9,
    );
    expect(aggregate.level).toBe("HIGH");
  });

  it("flips the aggregate level when the bad data dominates the emissions", () => {
    const aggregate = aggregateQuality([
      { score: scoreEntry(bestCase), weight: 100 },
      { score: scoreEntry(worstCase), weight: 9900 },
    ]);
    expect(aggregate.level).toBe("DEFAULT");
  });

  it("reports the emission share in each quality band", () => {
    const aggregate = aggregateQuality([
      { score: scoreEntry(bestCase), weight: 750 },
      { score: scoreEntry(worstCase), weight: 250 },
    ]);
    expect(aggregate.levelDistribution.HIGH).toBeCloseTo(0.75, 9);
    expect(sum(Object.values(aggregate.levelDistribution))).toBeCloseTo(1, 9);
  });

  it("falls back to an unweighted mean when no weights are usable", () => {
    const high = scoreEntry(bestCase);
    const low = scoreEntry(worstCase);
    const unweighted = aggregateQuality([{ score: high }, { score: low }]);
    const zeroWeighted = aggregateQuality([
      { score: high, weight: 0 },
      { score: low, weight: 0 },
    ]);
    expect(unweighted.overallScore).toBeCloseTo(
      (high.overallScore + low.overallScore) / 2,
      9,
    );
    expect(zeroWeighted.overallScore).toBeCloseTo(unweighted.overallScore, 9);
  });

  it("requires at least one score", () => {
    expect(() => aggregateQuality([])).toThrow(CalculationError);
  });
});

describe("toDataQualityScoreRecord", () => {
  it("shapes a score to the DataQualityScore columns", () => {
    const record = toDataQualityScoreRecord(scoreEntry(bestCase));
    expect(record).toMatchObject({
      overallScore: 97.5,
      completeness: 100,
      accuracy: 90,
      timeliness: 100,
      consistency: 100,
      reliability: 100,
    });
    expect(record.methodology).toContain("CIOS data-quality rubric v1");
    expect(record.notes).toContain("Reliability 100");
  });
});
