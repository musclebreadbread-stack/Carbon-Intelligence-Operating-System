/**
 * Object-storage abstraction for evidence files.
 *
 * Mirrors the pattern in `src/lib/notifications` and `src/lib/ai/embeddings`:
 * one interface, a zero-configuration default implementation, and a factory
 * that picks the real client once Phase B wires up actual credentials
 * (`src/lib/storage/factory.ts`). No framework imports.
 */

export type PutOptions = {
  readonly contentType?: string;
};

export type PutResult = {
  readonly key: string;
  /** SHA-256 hex digest of the bytes actually stored (see `hashEvidence`). */
  readonly hash: string;
  readonly size: number;
  /** Public/signed URL, when the provider has one; `null` for the memory client. */
  readonly url: string | null;
};

export type ObjectStorageClient = {
  readonly provider: string;
  put(key: string, bytes: Uint8Array, options?: PutOptions): Promise<PutResult>;
  get(key: string): Promise<Uint8Array | null>;
};
