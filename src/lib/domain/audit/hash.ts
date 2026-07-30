/**
 * Evidence hashing.
 *
 * SHA-256 digests for `AuditEvidence.hash` and `EvidencePackage.hash`, so a
 * verifier can prove a document has not been altered since it was submitted.
 *
 * Uses Node's built-in `node:crypto` — no framework, database or third-party
 * imports, so this stays unit-testable and runs in both the server runtime and
 * the test runner.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { ValidationError } from "@/lib/core/errors";

export const HASH_ALGORITHM = "sha256";
export const HASH_HEX_LENGTH = 64;

export type Hashable = string | Uint8Array;

/**
 * SHA-256 of the input, as 64 lower-case hex characters.
 * Strings are hashed as UTF-8.
 */
export function hashEvidence(content: Hashable): string {
  const hash = createHash(HASH_ALGORITHM);
  hash.update(typeof content === "string" ? Buffer.from(content, "utf8") : content);
  return hash.digest("hex");
}

/** True when `hash` is a well-formed SHA-256 hex digest. */
export function isValidHash(hash: string): boolean {
  return new RegExp(`^[0-9a-f]{${HASH_HEX_LENGTH}}$`).test(hash);
}

/**
 * Constant-time digest comparison, so verifying a hash cannot leak information
 * through timing. Case-insensitive on the hex input.
 */
export function hashesMatch(a: string, b: string): boolean {
  const normalizedA = a.trim().toLowerCase();
  const normalizedB = b.trim().toLowerCase();
  if (!isValidHash(normalizedA) || !isValidHash(normalizedB)) return false;
  return timingSafeEqual(Buffer.from(normalizedA, "hex"), Buffer.from(normalizedB, "hex"));
}

/** Verifies content against a stored digest. */
export function verifyEvidence(content: Hashable, expectedHash: string): boolean {
  return hashesMatch(hashEvidence(content), expectedHash);
}

export type EvidenceItem = {
  readonly id: string;
  readonly name: string;
  /** Pre-computed digest; supplied when the bytes live in object storage. */
  readonly hash?: string;
  /** Raw content, hashed when `hash` is absent. */
  readonly content?: Hashable;
  readonly fileSize?: number | null;
};

export type HashedEvidenceItem = {
  readonly id: string;
  readonly name: string;
  readonly hash: string;
  readonly fileSize: number | null;
};

export type EvidenceManifest = {
  readonly items: readonly HashedEvidenceItem[];
  /** Digest over the sorted per-item digests: the package-level hash. */
  readonly packageHash: string;
  readonly fileCount: number;
  readonly totalSize: number | null;
};

/**
 * Hashes a set of evidence items into a manifest.
 *
 * The package hash is `SHA-256("<id>:<hash>\n" … )` over items sorted by id, so
 * it is independent of the order the files were added and any single-file change
 * changes the package hash.
 */
export function hashEvidenceManifest(
  items: readonly EvidenceItem[],
): EvidenceManifest {
  const hashed: HashedEvidenceItem[] = items.map((item) => {
    if (item.hash !== undefined) {
      const normalized = item.hash.trim().toLowerCase();
      if (!isValidHash(normalized)) {
        throw new ValidationError(`Evidence item ${item.id} has a malformed SHA-256 hash`, {
          itemId: item.id,
          hash: item.hash,
        });
      }
      return {
        id: item.id,
        name: item.name,
        hash: normalized,
        fileSize: item.fileSize ?? null,
      };
    }
    if (item.content === undefined) {
      throw new ValidationError(
        `Evidence item ${item.id} provides neither content nor a hash`,
        { itemId: item.id },
      );
    }
    return {
      id: item.id,
      name: item.name,
      hash: hashEvidence(item.content),
      fileSize:
        item.fileSize ??
        (typeof item.content === "string"
          ? Buffer.byteLength(item.content, "utf8")
          : item.content.byteLength),
    };
  });

  const sorted = [...hashed].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const manifestText = sorted.map((item) => `${item.id}:${item.hash}`).join("\n");
  const sizes = sorted.map((item) => item.fileSize);

  return {
    items: hashed,
    packageHash: hashEvidence(manifestText),
    fileCount: hashed.length,
    totalSize: sizes.some((size) => size === null)
      ? null
      : sizes.reduce((total, size) => (total ?? 0) + (size ?? 0), 0),
  };
}
