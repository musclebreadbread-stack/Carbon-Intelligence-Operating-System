import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";
import { sum } from "@/lib/core/number";

import {
  FINDING_SEVERITIES,
  READINESS_DIMENSIONS,
  READINESS_WEIGHTS,
  isOpenFinding,
  normalizeSeverity,
  openFindingsByDueDate,
  readinessScore,
  severityRollup,
  type VerificationFindingLike,
} from "./findings";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const asOf = utc("2024-06-30");

const findings: readonly VerificationFindingLike[] = [
  {
    id: "f-critical",
    type: "non-conformity",
    severity: "CRITICAL",
    title: "Scope 1 activity data not reconciled to invoices",
    status: "open",
    dueDate: utc("2024-05-31"),
    assignedToId: "u-1",
  },
  {
    id: "f-major-open",
    type: "non-conformity",
    severity: "MAJOR",
    title: "Refrigerant log incomplete",
    status: "in_progress",
    dueDate: utc("2024-07-15"),
  },
  {
    id: "f-major-closed",
    type: "non-conformity",
    severity: "MAJOR",
    title: "Grid factor vintage outdated",
    status: "resolved",
    resolvedAt: utc("2024-04-01"),
  },
  {
    id: "f-minor",
    type: "observation",
    severity: "MINOR",
    title: "Unit label inconsistent",
    status: "open",
    dueDate: utc("2024-12-31"),
  },
  {
    id: "f-observation",
    type: "observation",
    severity: "OBSERVATION",
    title: "Consider automating meter reads",
    status: "open",
  },
];

describe("normalizeSeverity", () => {
  it("accepts the canonical ladder and common synonyms", () => {
    for (const severity of FINDING_SEVERITIES) {
      expect(normalizeSeverity(severity)).toBe(severity);
      expect(normalizeSeverity(severity.toLowerCase())).toBe(severity);
    }
    expect(normalizeSeverity("High")).toBe("MAJOR");
    expect(normalizeSeverity("medium")).toBe("MINOR");
    expect(normalizeSeverity("low")).toBe("OBSERVATION");
    expect(normalizeSeverity("info")).toBe("OBSERVATION");
  });

  it("rejects an unrecognised severity", () => {
    expect(() => normalizeSeverity("spicy")).toThrow(CalculationError);
  });
});

describe("isOpenFinding", () => {
  it("treats a resolution date or a closed status as closed", () => {
    expect(isOpenFinding({ id: "a", type: "x", severity: "MINOR", title: "t" })).toBe(true);
    expect(
      isOpenFinding({
        id: "a",
        type: "x",
        severity: "MINOR",
        title: "t",
        resolvedAt: utc("2024-01-01"),
      }),
    ).toBe(false);
    expect(
      isOpenFinding({ id: "a", type: "x", severity: "MINOR", title: "t", status: "Closed" }),
    ).toBe(false);
  });
});

describe("severityRollup", () => {
  const rollup = severityRollup(findings, asOf);

  it("counts every severity band, including empty ones", () => {
    expect(rollup.bySeverity.map((bucket) => bucket.severity)).toEqual([
      ...FINDING_SEVERITIES,
    ]);
    expect(rollup.bySeverity[0]).toMatchObject({
      severity: "CRITICAL",
      total: 1,
      open: 1,
      closed: 0,
      overdue: 1,
    });
    expect(rollup.bySeverity[1]).toMatchObject({
      severity: "MAJOR",
      total: 2,
      open: 1,
      closed: 1,
      overdue: 0,
    });
  });

  it("totals open, closed and overdue findings", () => {
    expect(rollup.total).toBe(5);
    expect(rollup.open).toBe(4);
    expect(rollup.closed).toBe(1);
    expect(rollup.overdue).toBe(1);
    expect(rollup.closureRate).toBeCloseTo(0.2, 12);
  });

  it("weights the open findings and names the worst open severity", () => {
    // CRITICAL 40 + MAJOR 15 + MINOR 5 + OBSERVATION 1
    expect(rollup.openWeight).toBe(61);
    expect(rollup.highestOpenSeverity).toBe("CRITICAL");
  });

  it("reports no highest severity when everything is closed", () => {
    const clean = severityRollup(
      findings.map((finding) => ({ ...finding, status: "closed", resolvedAt: utc("2024-01-01") })),
      asOf,
    );
    expect(clean.open).toBe(0);
    expect(clean.highestOpenSeverity).toBeNull();
    expect(clean.closureRate).toBe(1);
  });

  it("handles an empty list", () => {
    const empty = severityRollup([], asOf);
    expect(empty.total).toBe(0);
    expect(empty.closureRate).toBe(0);
    expect(empty.bySeverity).toHaveLength(4);
  });
});

describe("openFindingsByDueDate", () => {
  const triage = openFindingsByDueDate(findings, asOf, 30);

  it("buckets open findings by urgency", () => {
    expect(triage.overdue.map((f) => f.id)).toEqual(["f-critical"]);
    expect(triage.dueSoon.map((f) => f.id)).toEqual(["f-major-open"]);
    expect(triage.upcoming.map((f) => f.id)).toEqual(["f-minor"]);
    expect(triage.undated.map((f) => f.id)).toEqual(["f-observation"]);
    expect(triage.openCount).toBe(4);
  });

  it("computes whole days until the due date", () => {
    expect(triage.overdue[0].daysUntilDue).toBe(-30);
    expect(triage.dueSoon[0].daysUntilDue).toBe(15);
    expect(triage.undated[0].daysUntilDue).toBeNull();
  });

  it("excludes closed findings", () => {
    expect(
      [...triage.overdue, ...triage.dueSoon, ...triage.upcoming, ...triage.undated].map(
        (f) => f.id,
      ),
    ).not.toContain("f-major-closed");
  });

  it("orders within a bucket by due date then severity", () => {
    const sameDay: VerificationFindingLike[] = [
      { id: "b", type: "x", severity: "MINOR", title: "b", dueDate: utc("2024-06-01") },
      { id: "a", type: "x", severity: "CRITICAL", title: "a", dueDate: utc("2024-06-01") },
      { id: "c", type: "x", severity: "MAJOR", title: "c", dueDate: utc("2024-05-01") },
    ];
    const ordered = openFindingsByDueDate(sameDay, asOf, 30);
    expect(ordered.overdue.map((f) => f.id)).toEqual(["c", "a", "b"]);
  });

  it("honours the due-soon horizon", () => {
    const wide = openFindingsByDueDate(findings, asOf, 200);
    expect(wide.dueSoon.map((f) => f.id)).toEqual(["f-major-open", "f-minor"]);
    expect(wide.upcoming).toEqual([]);
  });

  it("rejects a negative horizon", () => {
    expect(() => openFindingsByDueDate(findings, asOf, -1)).toThrow(CalculationError);
  });
});

describe("readinessScore", () => {
  it("has weights over all five dimensions summing to 1", () => {
    expect(Object.keys(READINESS_WEIGHTS).sort()).toEqual([...READINESS_DIMENSIONS].sort());
    expect(sum(READINESS_DIMENSIONS.map((d) => READINESS_WEIGHTS[d]))).toBeCloseTo(1, 12);
  });

  it("scores a clean engagement as READY", () => {
    const score = readinessScore({
      findings: [],
      evidenceCompleteness: 1,
      dataQualityScore: 92,
      monitoringCoverage: 1,
      measurementCompleteness: 0.98,
    });
    // 100×0.3 + 100×0.25 + 92×0.2 + 100×0.15 + 98×0.1 = 98.2
    expect(score.score).toBeCloseTo(98.2, 9);
    expect(score.level).toBe("READY");
    expect(score.blockers).toEqual([]);
    expect(score.recommendations[0]).toContain("can proceed");
  });

  it("forces BLOCKED when a CRITICAL finding is open", () => {
    const score = readinessScore({
      findings,
      evidenceCompleteness: 1,
      dataQualityScore: 100,
      monitoringCoverage: 1,
      measurementCompleteness: 1,
      asOf,
    });
    expect(score.level).toBe("BLOCKED");
    expect(score.blockers[0]).toContain("open CRITICAL finding");
    expect(score.blockers.some((blocker) => blocker.includes("past their due date"))).toBe(
      true,
    );
    // findings component is 100 − 61 = 39
    expect(score.components.findings).toBe(39);
  });

  it("lands between READY and BLOCKED for a partially prepared engagement", () => {
    const score = readinessScore({
      findings: findings.filter((finding) => finding.severity !== "CRITICAL"),
      evidenceCompleteness: 0.8,
      dataQualityScore: 75,
      monitoringCoverage: 0.9,
      measurementCompleteness: 0.85,
      asOf,
    });
    // findings 100−21=79, evidence 80, quality 75, coverage 90, measurement 85
    expect(score.components.findings).toBe(79);
    expect(score.score).toBeCloseTo(
      79 * 0.3 + 80 * 0.25 + 75 * 0.2 + 90 * 0.15 + 85 * 0.1,
      9,
    );
    expect(score.level).toBe("NEARLY_READY");
    expect(score.blockers).toEqual([]);
  });

  it("scores a missing input as a neutral 60 rather than zero", () => {
    const score = readinessScore({ findings: [] });
    expect(score.components.evidence).toBe(60);
    expect(score.components.dataQuality).toBe(60);
    // 100×0.3 + 60×0.7 = 72
    expect(score.score).toBeCloseTo(72, 9);
    expect(score.level).toBe("NEARLY_READY");
  });

  it("names the dimensions dragging the score down", () => {
    const score = readinessScore({
      findings: [],
      evidenceCompleteness: 0.4,
      dataQualityScore: 50,
      monitoringCoverage: 1,
      measurementCompleteness: 1,
    });
    expect(score.recommendations.some((line) => line.includes("evidence"))).toBe(true);
    expect(score.recommendations.some((line) => line.includes("dataQuality"))).toBe(true);
    expect(score.blockers.some((line) => line.includes("half of the required evidence"))).toBe(
      true,
    );
  });

  it("drops to BLOCKED on a very low score even with no critical finding", () => {
    const score = readinessScore({
      findings: [
        { id: "m1", type: "x", severity: "MAJOR", title: "m1" },
        { id: "m2", type: "x", severity: "MAJOR", title: "m2" },
        { id: "m3", type: "x", severity: "MAJOR", title: "m3" },
      ],
      evidenceCompleteness: 0.2,
      dataQualityScore: 30,
      monitoringCoverage: 0.3,
      measurementCompleteness: 0.2,
    });
    expect(score.level).toBe("BLOCKED");
    expect(score.score).toBeLessThan(50);
  });

  it("validates its inputs", () => {
    expect(() => readinessScore({ findings: [], evidenceCompleteness: 1.5 })).toThrow(
      /evidenceCompleteness/,
    );
    expect(() => readinessScore({ findings: [], dataQualityScore: 120 })).toThrow(
      /dataQualityScore/,
    );
  });

  it("exposes the underlying severity rollup", () => {
    const score = readinessScore({ findings, asOf });
    expect(score.rollup.open).toBe(4);
    expect(score.methodology).toContain("CIOS verification-readiness rubric v1");
  });
});
