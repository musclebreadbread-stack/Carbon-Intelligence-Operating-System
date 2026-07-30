/**
 * The shared spine of every server action.
 *
 * `runAction` enforces the sequence decision 10 mandates, in order:
 *
 *   requireSession() → requirePermission() → zod safeParse → canWrite()
 *   → domain call → persist → buildAuditEntry → revalidatePath()
 *
 * Doing it once here rather than in fourteen action files is what makes the
 * guarantee testable: a new action cannot forget the auth re-check, because the
 * only way to write one is to go through this function.
 *
 * Not a `'use server'` module — it exports a generic helper, not an action.
 */

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import {
  buildAuditEntry,
  type AuditAction,
  type AuditEntry,
} from "@/lib/domain/audit/diff";
import { requirePermission, type AccessAttributes } from "@/lib/auth/rbac";
import { requireSession, type SessionUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/data/db";
import { prisma } from "@/lib/prisma";

import {
  actionSuccess,
  demoModeFailure,
  toActionError,
  validationFailure,
  type ActionState,
} from "./types";

/** What the handler receives once every gate has passed. */
export type ActionContext<TInput> = {
  readonly session: SessionUser;
  readonly input: TInput;
  readonly organizationId: string;
};

/** What a handler returns: its payload plus optional audit and revalidation. */
export type ActionOutcome<TData> = {
  readonly data: TData;
  readonly message?: string;
  readonly messageKey?: string;
  /**
   * Audit entries to persist. Built with `buildAuditEntry` by the handler, which
   * is the only place that knows the before/after shape.
   */
  readonly audit?: readonly AuditEntry[];
  /** Extra paths to revalidate beyond the action's declared `revalidate` list. */
  readonly revalidate?: readonly string[];
};

export type ActionDefinition<TSchema extends z.ZodTypeAny, TData> = {
  /** For the audit trail and the server log. */
  readonly name: string;
  readonly resource: string;
  readonly action: string;
  readonly schema: TSchema;
  /** Paths revalidated on success. */
  readonly revalidate?: readonly string[];
  /**
   * `true` for a read-only action, which is permitted in demo mode. Mutations
   * default to `false` and are refused with `DEMO_MODE`.
   */
  readonly readOnly?: boolean;
  /**
   * Extra ABAC attributes derived from the parsed input, so a policy scoped to
   * one facility or one reporting year can be evaluated.
   */
  readonly attributes?: (input: z.output<TSchema>) => AccessAttributes;
  readonly handler: (
    context: ActionContext<z.output<TSchema>>,
  ) => Promise<ActionOutcome<TData>>;
};

function organizationIdOf(session: SessionUser, input: unknown): string {
  if (typeof input === "object" && input !== null && "organizationId" in input) {
    const candidate = (input as { organizationId?: unknown }).organizationId;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return session.organizationId;
}

/**
 * Persists audit entries.
 *
 * Written outside the handler's own transaction on purpose: an audit entry must
 * survive even when the mutation it describes is rolled back by a later failure,
 * and a failure to write the audit trail must not roll back a successful
 * mutation. Both are recorded; neither can silently suppress the other.
 */
async function persistAudit(entries: readonly AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await prisma.auditTrail.createMany({
      data: entries.map(({ record }) => ({
        entityType: record.entityType,
        entityId: record.entityId,
        action: record.action,
        changes: record.changes as never,
        reason: record.reason,
        performedBy: record.performedBy,
        ipAddress: record.ipAddress,
        ...(record.timestamp ? { timestamp: record.timestamp } : {}),
      })),
    });
  } catch (error) {
    // The mutation already succeeded; losing the audit row is serious but must
    // not be reported to the user as a failed save.
    console.error("[action] failed to write audit trail", error);
  }
}

/**
 * Runs one action end to end.
 *
 * Errors are converted to an `ActionState`, never thrown: a thrown error in a
 * Server Action surfaces as an error boundary, which loses the form state the
 * user just typed.
 */
export async function runAction<TSchema extends z.ZodTypeAny, TData>(
  definition: ActionDefinition<TSchema, TData>,
  rawInput: unknown,
): Promise<ActionState<TData>> {
  try {
    // 1. Authenticate. Actions are reachable by direct POST, so this is required
    //    even when the page that renders the form is already gated.
    const session = await requireSession();

    // 2. Validate before authorising on attributes, so the ABAC attributes come
    //    from parsed, coerced values rather than raw form strings.
    const parsed = definition.schema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(parsed.error);
    }
    const input = parsed.data as z.output<TSchema>;
    const organizationId = organizationIdOf(session, input);

    // 3. Authorise, including the tenant boundary and any ABAC policy.
    //    `requirePermission` throws `UnauthorizedError`, but at this point the
    //    session is established, so the failure is a 403 and not a 401. Remapping
    //    it here lets the UI tell "sign in again" apart from "ask an admin".
    try {
      requirePermission(session, definition.resource, definition.action, {
        organizationId,
        ...(definition.attributes?.(input) ?? {}),
      });
    } catch (error) {
      const state = toActionError(error);
      return state.code === "UNAUTHORIZED"
        ? { ...state, code: "FORBIDDEN", messageKey: "action.error.forbidden" }
        : state;
    }

    // 4. Refuse mutations when there is nowhere to persist them.
    if (!definition.readOnly && !(await canWrite())) {
      return demoModeFailure();
    }

    // 5. Domain call and persistence.
    const outcome = await definition.handler({ session, input, organizationId });

    // 6. Audit trail.
    if (!definition.readOnly) {
      await persistAudit(outcome.audit ?? []);
    }

    // 7. Cache invalidation, so the same response carries the re-rendered UI.
    for (const path of [...(definition.revalidate ?? []), ...(outcome.revalidate ?? [])]) {
      revalidatePath(path);
    }

    return actionSuccess(
      outcome.data,
      outcome.message ?? `${definition.name} completed`,
      outcome.messageKey ?? `action.success.${definition.name}`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Convenience wrapper around `buildAuditEntry` that stamps the performer from the
 * session and redacts the sensitive columns by default.
 */
export function auditEntry(
  session: SessionUser,
  input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly action: AuditAction;
    readonly before?: Record<string, unknown> | null;
    readonly after?: Record<string, unknown> | null;
    readonly reason?: string | null;
    readonly ipAddress?: string | null;
    readonly timestamp?: Date;
  },
): AuditEntry {
  return buildAuditEntry({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    performedBy: session.userId,
    reason: input.reason ?? null,
    ipAddress: input.ipAddress ?? null,
    ...(input.timestamp ? { timestamp: input.timestamp } : {}),
    // `passwordHash`, `mfaSecret` and `credentials` must never reach the trail.
    diffOptions: {
      redactFields: ["passwordHash", "mfaSecret", "credentials", "keyHash", "config"],
    },
  });
}

export type { AuditAction, AuditEntry };
