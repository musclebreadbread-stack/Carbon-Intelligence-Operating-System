/**
 * Audit-trail change detection.
 *
 * `diffEntity` produces a field-level change map for `AuditTrail.changes`.
 * Sensitive fields are redacted rather than omitted: an auditor needs to know
 * that `passwordHash` changed without the value ever reaching the audit log.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

export const DEFAULT_REDACTED_FIELDS = [
  "passwordHash",
  "password",
  "mfaSecret",
  "credentials",
  "connectionString",
  "apiKey",
  "keyHash",
  "secret",
  "accessToken",
  "refreshToken",
  "privateKey",
] as const;

export const REDACTED_PLACEHOLDER = "[REDACTED]";

export type AuditAction = "create" | "update" | "delete" | "restore";

export type FieldChangeKind = "added" | "removed" | "changed";

export type FieldChange = {
  readonly field: string;
  readonly kind: FieldChangeKind;
  readonly from: unknown;
  readonly to: unknown;
  readonly redacted: boolean;
};

export type EntityDiff = {
  readonly changes: readonly FieldChange[];
  /** `AuditTrail.changes`-shaped map: field → `{ from, to }`. */
  readonly changeMap: Readonly<Record<string, { readonly from: unknown; readonly to: unknown }>>;
  readonly changedFields: readonly string[];
  readonly redactedFields: readonly string[];
  readonly hasChanges: boolean;
};

export type DiffOptions = {
  /** Field names whose values must never be written to the audit log. */
  readonly redactFields?: readonly string[];
  /** Fields to ignore entirely, e.g. `updatedAt`. */
  readonly ignoreFields?: readonly string[];
  /** Compare `redactFields` / `ignoreFields` case-insensitively. Default `true`. */
  readonly caseInsensitive?: boolean;
};

const DEFAULT_IGNORED = ["updatedAt", "createdAt"] as const;

function normalize(field: string, caseInsensitive: boolean): string {
  return caseInsensitive ? field.toLowerCase() : field;
}

/** Structural equality for the JSON-serialisable values Prisma columns hold. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    const aTime = a instanceof Date ? a.getTime() : Number.NaN;
    const bTime = b instanceof Date ? b.getTime() : Number.NaN;
    return Number.isFinite(aTime) && Number.isFinite(bTime) && aTime === bTime;
  }
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b) ? true : a === b;
  }
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => valuesEqual(item, b[index]));
  }
  const aObject = a as Record<string, unknown>;
  const bObject = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aObject), ...Object.keys(bObject)]);
  for (const key of keys) {
    if (!valuesEqual(aObject[key], bObject[key])) return false;
  }
  return true;
}

/**
 * Field-level diff between two versions of an entity.
 *
 * `before` is `null`/`undefined` for a creation and `after` for a deletion; the
 * resulting changes are then all `added` or all `removed` respectively.
 */
export function diffEntity(
  before: Readonly<Record<string, unknown>> | null | undefined,
  after: Readonly<Record<string, unknown>> | null | undefined,
  options: DiffOptions = {},
): EntityDiff {
  const caseInsensitive = options.caseInsensitive ?? true;
  const redacted = new Set(
    (options.redactFields ?? DEFAULT_REDACTED_FIELDS).map((field) =>
      normalize(field, caseInsensitive),
    ),
  );
  const ignored = new Set(
    (options.ignoreFields ?? DEFAULT_IGNORED).map((field) => normalize(field, caseInsensitive)),
  );

  const beforeObject = before ?? {};
  const afterObject = after ?? {};
  const fields = [...new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])].sort();

  const changes: FieldChange[] = [];

  for (const field of fields) {
    const key = normalize(field, caseInsensitive);
    if (ignored.has(key)) continue;

    const hadBefore = Object.prototype.hasOwnProperty.call(beforeObject, field);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterObject, field);
    const from = beforeObject[field];
    const to = afterObject[field];

    if (hadBefore && hasAfter && valuesEqual(from, to)) continue;

    const kind: FieldChangeKind = !hadBefore ? "added" : !hasAfter ? "removed" : "changed";
    const isRedacted = redacted.has(key);

    changes.push({
      field,
      kind,
      from: isRedacted && hadBefore ? REDACTED_PLACEHOLDER : hadBefore ? from : undefined,
      to: isRedacted && hasAfter ? REDACTED_PLACEHOLDER : hasAfter ? to : undefined,
      redacted: isRedacted,
    });
  }

  const changeMap: Record<string, { from: unknown; to: unknown }> = {};
  for (const change of changes) {
    changeMap[change.field] = { from: change.from, to: change.to };
  }

  return {
    changes,
    changeMap,
    changedFields: changes.map((change) => change.field),
    redactedFields: changes.filter((change) => change.redacted).map((change) => change.field),
    hasChanges: changes.length > 0,
  };
}

/** Plain object shaped to `AuditTrail`. */
export type AuditTrailRecord = {
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly changes: Readonly<Record<string, unknown>> | null;
  readonly reason: string | null;
  readonly performedBy: string | null;
  readonly ipAddress: string | null;
  readonly timestamp?: Date;
};

export type BuildAuditEntryInput = {
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly before?: Readonly<Record<string, unknown>> | null;
  readonly after?: Readonly<Record<string, unknown>> | null;
  readonly performedBy?: string | null;
  readonly reason?: string | null;
  readonly ipAddress?: string | null;
  /** Supplied for deterministic tests; otherwise the database default applies. */
  readonly timestamp?: Date;
  readonly diffOptions?: DiffOptions;
};

export type AuditEntry = {
  readonly record: AuditTrailRecord;
  readonly diff: EntityDiff;
  /** Human-readable summary of what changed. */
  readonly summary: string;
};

/**
 * Builds an audit-trail entry.
 *
 * The `changes` payload is `null` when nothing changed, so a no-op update does
 * not litter the trail with empty entries; the caller can check
 * `diff.hasChanges` and skip persisting altogether.
 */
export function buildAuditEntry(input: BuildAuditEntryInput): AuditEntry {
  const diff = diffEntity(input.before, input.after, input.diffOptions);

  const summary =
    input.action === "create"
      ? `Created ${input.entityType} ${input.entityId} with ${diff.changedFields.length} field(s) set.`
      : input.action === "delete"
        ? `Deleted ${input.entityType} ${input.entityId}.`
        : diff.hasChanges
          ? `Updated ${input.entityType} ${input.entityId}: ${diff.changes
              .map((change) => describeChange(change))
              .join("; ")}.`
          : `No changes recorded for ${input.entityType} ${input.entityId}.`;

  return {
    record: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      changes: diff.hasChanges ? diff.changeMap : null,
      reason: input.reason ?? null,
      performedBy: input.performedBy ?? null,
      ipAddress: input.ipAddress ?? null,
      ...(input.timestamp ? { timestamp: input.timestamp } : {}),
    },
    diff,
    summary,
  };
}

function describeChange(change: FieldChange): string {
  const render = (value: unknown): string => {
    if (value === undefined) return "unset";
    if (value === null) return "null";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  switch (change.kind) {
    case "added":
      return `${change.field} set to ${render(change.to)}`;
    case "removed":
      return `${change.field} removed (was ${render(change.from)})`;
    default:
      return `${change.field} ${render(change.from)} → ${render(change.to)}`;
  }
}

/** Plain object shaped to `VersionHistory`. */
export type VersionHistoryRecord = {
  readonly entityType: string;
  readonly entityId: string;
  readonly version: number;
  readonly changes: Readonly<Record<string, unknown>> | null;
  readonly changeReason: string | null;
  readonly changedBy: string | null;
  readonly snapshot: Readonly<Record<string, unknown>> | null;
};

/**
 * Builds a version-history record. The snapshot is redacted with the same rules
 * as the diff, so a sensitive value cannot leak through the snapshot column.
 */
export function buildVersionHistory(input: {
  readonly entityType: string;
  readonly entityId: string;
  readonly version: number;
  readonly before?: Readonly<Record<string, unknown>> | null;
  readonly after: Readonly<Record<string, unknown>>;
  readonly changeReason?: string | null;
  readonly changedBy?: string | null;
  readonly diffOptions?: DiffOptions;
}): VersionHistoryRecord {
  const diff = diffEntity(input.before, input.after, input.diffOptions);
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.version,
    changes: diff.hasChanges ? diff.changeMap : null,
    changeReason: input.changeReason ?? null,
    changedBy: input.changedBy ?? null,
    snapshot: redactSnapshot(input.after, input.diffOptions),
  };
}

/** Copy of `entity` with sensitive values replaced by the placeholder. */
export function redactSnapshot(
  entity: Readonly<Record<string, unknown>>,
  options: DiffOptions = {},
): Readonly<Record<string, unknown>> {
  const caseInsensitive = options.caseInsensitive ?? true;
  const redacted = new Set(
    (options.redactFields ?? DEFAULT_REDACTED_FIELDS).map((field) =>
      normalize(field, caseInsensitive),
    ),
  );
  return Object.fromEntries(
    Object.entries(entity).map(([field, value]) => [
      field,
      redacted.has(normalize(field, caseInsensitive)) ? REDACTED_PLACEHOLDER : value,
    ]),
  );
}
