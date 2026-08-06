import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUDIT_RETENTION_DAYS,
  isPastRetention,
  partitionByRetention,
  retentionCutoff,
} from "./retention";

const AS_OF = new Date(Date.UTC(2025, 0, 1));

describe("retentionCutoff", () => {
  it("subtracts the retention window from asOf", () => {
    const cutoff = retentionCutoff(30, AS_OF);
    expect(cutoff.getTime()).toBe(AS_OF.getTime() - 30 * 24 * 60 * 60 * 1000);
  });

  it("defaults to the documented 365-day window", () => {
    expect(retentionCutoff(undefined, AS_OF).getTime()).toBe(
      retentionCutoff(DEFAULT_AUDIT_RETENTION_DAYS, AS_OF).getTime(),
    );
  });

  it("rejects a zero or negative retention window", () => {
    expect(() => retentionCutoff(0, AS_OF)).toThrow(/positive number/);
    expect(() => retentionCutoff(-5, AS_OF)).toThrow(/positive number/);
  });
});

describe("isPastRetention", () => {
  it("is true for a timestamp older than the window and false for one within it", () => {
    const old = new Date(Date.UTC(2024, 0, 1));
    const recent = new Date(Date.UTC(2024, 11, 1));
    expect(isPastRetention(old, 90, AS_OF)).toBe(true);
    expect(isPastRetention(recent, 90, AS_OF)).toBe(false);
  });

  it("is deterministic for a fixed asOf, matching the domain layer's reproducibility rule", () => {
    const timestamp = new Date(Date.UTC(2023, 5, 15));
    expect(isPastRetention(timestamp, 365, AS_OF)).toBe(isPastRetention(timestamp, 365, AS_OF));
  });
});

describe("partitionByRetention", () => {
  it("splits rows on the retention cutoff", () => {
    const rows = [
      { id: "old", timestamp: new Date(Date.UTC(2023, 0, 1)) },
      { id: "recent", timestamp: new Date(Date.UTC(2024, 11, 31)) },
    ];

    const { toArchive, toKeep } = partitionByRetention(rows, 90, AS_OF);

    expect(toArchive.map((row) => row.id)).toEqual(["old"]);
    expect(toKeep.map((row) => row.id)).toEqual(["recent"]);
  });

  it("archives nothing when every row is within the window", () => {
    const rows = [{ id: "recent", timestamp: new Date(Date.UTC(2024, 11, 30)) }];
    const { toArchive, toKeep } = partitionByRetention(rows, 365, AS_OF);
    expect(toArchive).toEqual([]);
    expect(toKeep).toEqual(rows);
  });
});
