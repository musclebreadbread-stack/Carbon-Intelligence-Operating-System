/**
 * Object-storage client selection.
 *
 * No real provider is wired up yet (Phase B), so this always returns the
 * memory client today. `isStorageConfigured()`/`describeStorageMode()` exist
 * now so the settings page and future actions have one place to ask "is this
 * durable?" without caring which provider answers later — the same shape
 * `src/lib/notifications/factory.ts` and `src/lib/ai/embeddings/factory.ts` use.
 */

import { MemoryObjectStorageClient } from "./memory-storage-client";
import type { ObjectStorageClient } from "./types";

export type StorageMode = "memory";

/** Always `false` until a real provider (Supabase Storage/S3) is added in Phase B. */
export function isStorageConfigured(): boolean {
  return false;
}

export function getStorageMode(): StorageMode {
  return "memory";
}

let sharedMemoryClient: MemoryObjectStorageClient | null = null;

/**
 * The active storage client. A shared instance (unlike the notification
 * channel's fresh-per-call instance): evidence written in one action may need
 * to be read back by another within the same process lifetime.
 */
export function getObjectStorageClient(): ObjectStorageClient {
  sharedMemoryClient ??= new MemoryObjectStorageClient();
  return sharedMemoryClient;
}

/** Human-readable description of the active mode, for a Settings-panel badge. */
export function describeStorageMode(): {
  readonly mode: StorageMode;
  readonly label: string;
  readonly labelKo: string;
} {
  return {
    mode: "memory",
    label: "Evidence files are held in process memory only (no durable storage configured)",
    labelKo: "증빙 파일이 프로세스 메모리에만 보관됩니다 (영구 저장소 미설정)",
  };
}
