"use server";

/**
 * Field-encryption key rotation.
 *
 * Scoped to `DataSource.credentials` — the only column any action in this
 * codebase currently encrypts (`src/lib/actions/agent.ts`). `User.passwordHash`
 * is deliberately excluded: it is a scrypt digest (`hashPassword`), not an AES
 * envelope, and is not recoverable by design — passwords live in Supabase Auth.
 *
 * Requires both `FIELD_ENCRYPTION_KEY` (the old key, still decrypting existing
 * rows) and `FIELD_ENCRYPTION_KEY_V2` (the new key `currentFieldCryptoVersion()`
 * has already switched new writes to) to be configured; running this before a
 * rotation has begun is refused with a clear "not configured" error rather than
 * silently doing nothing.
 */

import { z } from "zod";

import {
  FieldCryptoError,
  isEncrypted,
  resolveKeyForVersion,
  rotateFieldValue,
} from "@/lib/security/field-crypto";
import { prisma } from "@/lib/prisma";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const rotateFieldEncryptionInputSchema = z.object({});

export type RotateFieldEncryptionResult = {
  /** Rows re-encrypted under the new key. */
  readonly rotated: number;
  /** Rows with no encrypted value, or already tagged v2 — left untouched. */
  readonly skipped: number;
};

export async function rotateFieldEncryptionAction(
  rawInput: unknown,
): Promise<ActionState<RotateFieldEncryptionResult>> {
  return runAction(
    {
      name: "rotateFieldEncryption",
      resource: "security",
      action: "update",
      schema: rotateFieldEncryptionInputSchema,
      revalidate: ["/security"],
      handler: async ({ session }) => {
        // Resolved once up front: an absent key refuses the whole rotation
        // immediately rather than partially rotating rows before failing.
        const oldKey = resolveKeyForVersion("v1");
        const newKey = resolveKeyForVersion("v2");

        const rows = await prisma.dataSource.findMany({
          select: { id: true, credentials: true },
        });

        const updates: { readonly id: string; readonly credentials: string }[] = [];
        let skipped = 0;

        for (const row of rows) {
          const value = row.credentials;
          if (typeof value !== "string" || !isEncrypted(value) || value.startsWith("v2.")) {
            skipped += 1;
            continue;
          }
          try {
            updates.push({ id: row.id, credentials: rotateFieldValue(value, oldKey, newKey) });
          } catch (error) {
            // A row that fails to decrypt under the declared old key (wrong key,
            // corrupted value) is skipped, not fatal to the rest of the batch.
            if (error instanceof FieldCryptoError) {
              skipped += 1;
              continue;
            }
            throw error;
          }
        }

        if (updates.length > 0) {
          await prisma.$transaction(
            updates.map((update) =>
              prisma.dataSource.update({
                where: { id: update.id },
                data: { credentials: update.credentials },
              }),
            ),
          );
        }

        return {
          data: { rotated: updates.length, skipped },
          message: `Rotated ${updates.length} data source credential(s); ${skipped} skipped.`,
          messageKey: "action.success.rotateFieldEncryption",
          audit: [
            auditEntry(session, {
              entityType: "DataSource",
              entityId: "bulk-rotation",
              action: "update",
              after: { rotated: updates.length, skipped },
              reason: "Field encryption key rotation (v1 -> v2)",
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
