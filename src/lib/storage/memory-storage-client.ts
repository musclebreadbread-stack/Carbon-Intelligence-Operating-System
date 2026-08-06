/**
 * In-process object storage: the default `ObjectStorageClient` until Phase B
 * wires up a real bucket (Supabase Storage or S3).
 *
 * Deliberately in-memory rather than the local filesystem — a serverless
 * runtime's filesystem is read-only outside `/tmp` and never shared across
 * invocations, so writing to disk would be a false promise of durability.
 * This client makes that limitation explicit instead: content survives only
 * for the lifetime of the process, exactly as far as its guarantee goes.
 */

import { hashEvidence } from "@/lib/domain/audit/hash";

import type { ObjectStorageClient, PutOptions, PutResult } from "./types";

export class MemoryObjectStorageClient implements ObjectStorageClient {
  readonly provider = "memory";
  private readonly store = new Map<string, Uint8Array>();

  async put(key: string, bytes: Uint8Array, options?: PutOptions): Promise<PutResult> {
    void options;
    this.store.set(key, bytes);
    return { key, hash: hashEvidence(bytes), size: bytes.byteLength, url: null };
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.store.get(key) ?? null;
  }
}
