import { describe, expect, it } from "vitest";

import { hashEvidence } from "@/lib/domain/audit/hash";

import { MemoryObjectStorageClient } from "./memory-storage-client";

describe("MemoryObjectStorageClient", () => {
  it("returns the SHA-256 of the exact bytes stored, not a placeholder", async () => {
    const client = new MemoryObjectStorageClient();
    const bytes = new TextEncoder().encode("evidence file contents");

    const result = await client.put("evidence/1", bytes);

    expect(result.hash).toBe(hashEvidence(bytes));
    expect(result.size).toBe(bytes.byteLength);
    expect(result.url).toBeNull();
  });

  it("round-trips a put through get", async () => {
    const client = new MemoryObjectStorageClient();
    const bytes = new TextEncoder().encode("round trip");

    await client.put("evidence/2", bytes);
    const read = await client.get("evidence/2");

    expect(read).toEqual(bytes);
  });

  it("returns null for a key that was never written", async () => {
    const client = new MemoryObjectStorageClient();
    await expect(client.get("nonexistent")).resolves.toBeNull();
  });

  it("hashes differently-keyed content independently — a later write does not corrupt an earlier one", async () => {
    const client = new MemoryObjectStorageClient();
    const a = new TextEncoder().encode("file a");
    const b = new TextEncoder().encode("file b");

    await client.put("a", a);
    await client.put("b", b);

    expect(await client.get("a")).toEqual(a);
    expect(await client.get("b")).toEqual(b);
  });
});
