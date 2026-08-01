import { describe, expect, it } from "vitest";

import {
  DEFAULT_REDACTED_FIELDS,
  REDACTED_PLACEHOLDER,
  buildAuditEntry,
  buildVersionHistory,
  diffEntity,
  redactSnapshot,
  valuesEqual,
} from "./diff";

describe("valuesEqual", () => {
  it("compares primitives, dates, arrays and nested objects", () => {
    expect(valuesEqual(1, 1)).toBe(true);
    expect(valuesEqual("a", "a")).toBe(true);
    expect(valuesEqual(null, null)).toBe(true);
    expect(valuesEqual(new Date("2024-01-01"), new Date("2024-01-01"))).toBe(true);
    expect(valuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(valuesEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
  });

  it("detects differences", () => {
    expect(valuesEqual(1, 2)).toBe(false);
    expect(valuesEqual(1, "1")).toBe(false);
    expect(valuesEqual(null, undefined)).toBe(false);
    expect(valuesEqual(new Date("2024-01-01"), new Date("2024-01-02"))).toBe(false);
    expect(valuesEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(valuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(valuesEqual([1], { 0: 1 })).toBe(false);
  });

  it("treats NaN as equal to itself so it is not reported as a change", () => {
    expect(valuesEqual(Number.NaN, Number.NaN)).toBe(true);
  });
});

describe("diffEntity", () => {
  it("detects added, removed and changed fields", () => {
    const diff = diffEntity(
      { name: "Seoul Plant", area: 1000, code: "SP1" },
      { name: "Seoul Plant 1", area: 1000, country: "KR" },
    );
    expect(diff.hasChanges).toBe(true);
    expect(diff.changedFields).toEqual(["code", "country", "name"]);
    const byField = new Map(diff.changes.map((change) => [change.field, change]));
    expect(byField.get("name")).toMatchObject({
      kind: "changed",
      from: "Seoul Plant",
      to: "Seoul Plant 1",
    });
    expect(byField.get("country")).toMatchObject({ kind: "added", from: undefined, to: "KR" });
    expect(byField.get("code")).toMatchObject({ kind: "removed", from: "SP1", to: undefined });
  });

  it("returns an empty diff for identical entities", () => {
    const entity = { name: "A", nested: { x: 1 }, list: [1, 2] };
    const diff = diffEntity(entity, { ...entity, nested: { x: 1 }, list: [1, 2] });
    expect(diff.hasChanges).toBe(false);
    expect(diff.changes).toEqual([]);
    expect(diff.changeMap).toEqual({});
  });

  it("ignores createdAt and updatedAt by default", () => {
    const diff = diffEntity(
      { name: "A", updatedAt: new Date("2024-01-01"), createdAt: new Date("2023-01-01") },
      { name: "A", updatedAt: new Date("2024-06-01"), createdAt: new Date("2023-01-01") },
    );
    expect(diff.hasChanges).toBe(false);
  });

  it("honours a custom ignore list", () => {
    const diff = diffEntity({ a: 1, b: 1 }, { a: 2, b: 2 }, { ignoreFields: ["b"] });
    expect(diff.changedFields).toEqual(["a"]);
  });

  it("redacts sensitive values while still reporting that they changed", () => {
    const diff = diffEntity(
      { email: "a@example.com", passwordHash: "old-hash", mfaSecret: "OLD" },
      { email: "a@example.com", passwordHash: "new-hash", mfaSecret: "NEW" },
    );
    expect(diff.changedFields).toEqual(["mfaSecret", "passwordHash"]);
    expect(diff.redactedFields).toEqual(["mfaSecret", "passwordHash"]);
    for (const change of diff.changes) {
      expect(change.from).toBe(REDACTED_PLACEHOLDER);
      expect(change.to).toBe(REDACTED_PLACEHOLDER);
      expect(change.redacted).toBe(true);
    }
    expect(JSON.stringify(diff.changeMap)).not.toContain("old-hash");
    expect(JSON.stringify(diff.changeMap)).not.toContain("new-hash");
  });

  it("redacts the DataSource credentials object", () => {
    const diff = diffEntity(
      { name: "SAP", credentials: { user: "svc", password: "s3cret" } },
      { name: "SAP", credentials: { user: "svc2", password: "n3w" } },
    );
    expect(diff.changeMap.credentials).toEqual({
      from: REDACTED_PLACEHOLDER,
      to: REDACTED_PLACEHOLDER,
    });
    expect(JSON.stringify(diff.changeMap)).not.toContain("s3cret");
  });

  it("redacts case-insensitively and honours a custom redact list", () => {
    expect(
      diffEntity({ PasswordHash: "a" }, { PasswordHash: "b" }).changeMap.PasswordHash,
    ).toEqual({ from: REDACTED_PLACEHOLDER, to: REDACTED_PLACEHOLDER });

    const custom = diffEntity(
      { salary: 100, passwordHash: "a" },
      { salary: 200, passwordHash: "b" },
      { redactFields: ["salary"] },
    );
    expect(custom.changeMap.salary).toEqual({
      from: REDACTED_PLACEHOLDER,
      to: REDACTED_PLACEHOLDER,
    });
    // passwordHash is no longer in the redact list, so its values pass through.
    expect(custom.changeMap.passwordHash).toEqual({ from: "a", to: "b" });
  });

  it("covers the documented sensitive field names", () => {
    for (const field of DEFAULT_REDACTED_FIELDS) {
      const diff = diffEntity({ [field]: "before" }, { [field]: "after" });
      expect(diff.redactedFields, field).toEqual([field]);
    }
  });

  it("treats a null before as a creation and a null after as a deletion", () => {
    const created = diffEntity(null, { name: "A", value: 1 });
    expect(created.changes.every((change) => change.kind === "added")).toBe(true);
    const deleted = diffEntity({ name: "A", value: 1 }, null);
    expect(deleted.changes.every((change) => change.kind === "removed")).toBe(true);
  });

  it("returns no changes when both sides are absent", () => {
    expect(diffEntity(null, null).hasChanges).toBe(false);
  });
});

describe("buildAuditEntry", () => {
  const timestamp = new Date("2024-06-15T12:00:00.000Z");

  it("shapes an update to the AuditTrail columns", () => {
    const entry = buildAuditEntry({
      entityType: "Facility",
      entityId: "fac-1",
      action: "update",
      before: { name: "Seoul Plant", area: 1000 },
      after: { name: "Seoul Plant 1", area: 1200 },
      performedBy: "user-1",
      reason: "Corrected the site name after the survey",
      ipAddress: "203.0.113.9",
      timestamp,
    });

    expect(entry.record).toEqual({
      entityType: "Facility",
      entityId: "fac-1",
      action: "update",
      changes: {
        area: { from: 1000, to: 1200 },
        name: { from: "Seoul Plant", to: "Seoul Plant 1" },
      },
      reason: "Corrected the site name after the survey",
      performedBy: "user-1",
      ipAddress: "203.0.113.9",
      timestamp,
    });
    expect(entry.summary).toContain("area 1000 → 1200");
    expect(entry.summary).toContain("name Seoul Plant → Seoul Plant 1");
  });

  it("records null changes and says so when nothing changed", () => {
    const entry = buildAuditEntry({
      entityType: "Facility",
      entityId: "fac-1",
      action: "update",
      before: { name: "A" },
      after: { name: "A" },
    });
    expect(entry.record.changes).toBeNull();
    expect(entry.diff.hasChanges).toBe(false);
    expect(entry.summary).toContain("No changes recorded");
  });

  it("summarises creations and deletions", () => {
    expect(
      buildAuditEntry({
        entityType: "EmissionFactor",
        entityId: "ef-1",
        action: "create",
        after: { name: "Grid", value: 0.4 },
      }).summary,
    ).toBe("Created EmissionFactor ef-1 with 2 field(s) set.");

    expect(
      buildAuditEntry({
        entityType: "EmissionFactor",
        entityId: "ef-1",
        action: "delete",
        before: { name: "Grid" },
      }).summary,
    ).toBe("Deleted EmissionFactor ef-1.");
  });

  it("never writes a redacted value into the audit record or the summary", () => {
    const entry = buildAuditEntry({
      entityType: "User",
      entityId: "user-1",
      action: "update",
      before: { email: "a@example.com", passwordHash: "old-hash" },
      after: { email: "b@example.com", passwordHash: "new-hash" },
      performedBy: "admin",
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("old-hash");
    expect(serialized).not.toContain("new-hash");
    expect(serialized).toContain(REDACTED_PLACEHOLDER);
    expect(entry.summary).toContain("email a@example.com → b@example.com");
  });

  it("omits the timestamp so the database default applies", () => {
    const entry = buildAuditEntry({
      entityType: "Facility",
      entityId: "fac-1",
      action: "update",
      before: { a: 1 },
      after: { a: 2 },
    });
    expect(entry.record).not.toHaveProperty("timestamp");
    expect(entry.record.performedBy).toBeNull();
    expect(entry.record.reason).toBeNull();
    expect(entry.record.ipAddress).toBeNull();
  });
});

describe("redactSnapshot / buildVersionHistory", () => {
  it("redacts sensitive fields in a snapshot", () => {
    const snapshot = redactSnapshot({
      email: "a@example.com",
      passwordHash: "hash",
      credentials: { user: "svc" },
    });
    expect(snapshot).toEqual({
      email: "a@example.com",
      passwordHash: REDACTED_PLACEHOLDER,
      credentials: REDACTED_PLACEHOLDER,
    });
  });

  it("shapes a version-history record with a redacted snapshot", () => {
    const record = buildVersionHistory({
      entityType: "Rule",
      entityId: "rule-1",
      version: 3,
      before: { name: "Old rule", apiKey: "k1" },
      after: { name: "New rule", apiKey: "k2" },
      changeReason: "Threshold updated",
      changedBy: "user-2",
    });
    expect(record.version).toBe(3);
    expect(record.changeReason).toBe("Threshold updated");
    expect(record.changedBy).toBe("user-2");
    expect(record.changes).toEqual({
      apiKey: { from: REDACTED_PLACEHOLDER, to: REDACTED_PLACEHOLDER },
      name: { from: "Old rule", to: "New rule" },
    });
    expect(record.snapshot).toEqual({ name: "New rule", apiKey: REDACTED_PLACEHOLDER });
    expect(JSON.stringify(record)).not.toContain("k2");
  });

  it("records a null change map for an unchanged version", () => {
    const record = buildVersionHistory({
      entityType: "Rule",
      entityId: "rule-1",
      version: 4,
      before: { name: "Same" },
      after: { name: "Same" },
    });
    expect(record.changes).toBeNull();
    expect(record.snapshot).toEqual({ name: "Same" });
  });
});
