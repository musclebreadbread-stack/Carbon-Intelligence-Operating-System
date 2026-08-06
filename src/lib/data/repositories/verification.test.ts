/**
 * `listFindings` used to hard-code `misstatementAmount: null` on the real-database
 * path with a comment explaining the amount was smuggled into `description`
 * instead. Now that `VerificationFinding` carries `misstatementAmount`,
 * `estimatedFinancialImpact` and `impactCurrency` as real columns, this pins that
 * the repository actually reads them rather than silently discarding whatever a
 * verifier recorded.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findManyFindings = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    verificationFinding: { findMany: (...args: unknown[]) => findManyFindings(...args) },
  },
}));

import { DEMO_VERIFICATION_ENGAGEMENT } from "../demo";
import { getDataMode, resetDataMode } from "../db";
import { listFindings } from "./verification";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

function p1001(): Error & { code: string } {
  const error = new Error("Can't reach database server at db.internal:5432") as Error & {
    code: string;
  };
  error.code = "P1001";
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  process.env.DATABASE_URL = REAL_URL;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

describe("listFindings against a database", () => {
  it("reads misstatementAmount, estimatedFinancialImpact and impactCurrency straight off the row", async () => {
    findManyFindings.mockResolvedValue([
      {
        id: "finding-1",
        engagementId: "engagement-1",
        type: "MISSTATEMENT",
        severity: "MAJOR",
        title: "Overstated Scope 1",
        description: "Fuel volume double-counted.",
        recommendation: "Reconcile against the ERP export.",
        response: null,
        status: "open",
        dueDate: null,
        resolvedAt: null,
        assignedToId: null,
        misstatementAmount: 480,
        estimatedFinancialImpact: 12_000,
        impactCurrency: "USD",
      },
    ]);

    const findings = await listFindings("engagement-1");

    expect(findings).toHaveLength(1);
    expect(findings[0]?.misstatementAmount).toBe(480);
    expect(findings[0]?.estimatedFinancialImpact).toBe(12_000);
    expect(findings[0]?.impactCurrency).toBe("USD");
  });

  it("passes through null money fields for an unquantified finding, not a stale hard-coded null", async () => {
    findManyFindings.mockResolvedValue([
      {
        id: "finding-2",
        engagementId: "engagement-1",
        type: "OBSERVATION",
        severity: "MINOR",
        title: "Missing evidence",
        description: null,
        recommendation: null,
        response: null,
        status: "open",
        dueDate: null,
        resolvedAt: null,
        assignedToId: null,
        misstatementAmount: null,
        estimatedFinancialImpact: null,
        impactCurrency: null,
      },
    ]);

    const findings = await listFindings("engagement-1");

    expect(findings[0]?.misstatementAmount).toBeNull();
    expect(findings[0]?.estimatedFinancialImpact).toBeNull();
  });
});

describe("listFindings in demo mode", () => {
  it("falls back to the demo fixture, money fields included", async () => {
    findManyFindings.mockRejectedValue(p1001());

    const findings = await listFindings(DEMO_VERIFICATION_ENGAGEMENT.id);

    expect(getDataMode()).toBe("demo");
    expect(findings.length).toBeGreaterThan(0);
    const quantified = findings.find((finding) => finding.id === "demo-finding-01");
    expect(quantified?.misstatementAmount).toBe(1_083);
    expect(quantified?.estimatedFinancialImpact).toBe(18_500);
    expect(quantified?.impactCurrency).toBe("USD");
  });
});
