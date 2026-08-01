/**
 * Inventory period close/lock tests.
 *
 * Verifies:
 * - isPeriodLocked correctly identifies locked periods
 * - periodLockGuard returns PERIOD_LOCKED error for locked periods
 * - periodLockGuard returns null for unlocked periods
 */

import { describe, expect, it } from "vitest";

import { isPeriodLocked, periodLockGuard } from "./inventory-close";

describe("isPeriodLocked", () => {
  it("returns true when lockedAt is set", () => {
    expect(isPeriodLocked({ lockedAt: new Date(), status: "locked" })).toBe(true);
  });

  it("returns true when status is locked", () => {
    expect(isPeriodLocked({ lockedAt: null, status: "locked" })).toBe(true);
  });

  it("returns true when status is approved", () => {
    expect(isPeriodLocked({ lockedAt: null, status: "approved" })).toBe(true);
  });

  it("returns false for draft status with no lock", () => {
    expect(isPeriodLocked({ lockedAt: null, status: "draft" })).toBe(false);
  });

  it("returns false for published status with no lock", () => {
    expect(isPeriodLocked({ lockedAt: null, status: "published" })).toBe(false);
  });
});

describe("periodLockGuard", () => {
  it("returns PERIOD_LOCKED error for locked period", () => {
    const result = periodLockGuard({ lockedAt: new Date(), status: "locked" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("error");
    if (result!.status === "error") {
      expect(result!.messageKey).toBe("action.error.PERIOD_LOCKED");
      expect(result!.code).toBe("CONFLICT");
    }
  });

  it("returns null for unlocked period", () => {
    const result = periodLockGuard({ lockedAt: null, status: "draft" });
    expect(result).toBeNull();
  });

  it("blocks mutations on approved periods", () => {
    const result = periodLockGuard({ lockedAt: null, status: "approved" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("error");
  });
});
