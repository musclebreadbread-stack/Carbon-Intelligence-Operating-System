import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/core/errors";

import {
  HASH_HEX_LENGTH,
  hashEvidence,
  hashEvidenceManifest,
  hashesMatch,
  isValidHash,
  verifyEvidence,
} from "./hash";

describe("hashEvidence", () => {
  it("returns 64 lower-case hex characters", () => {
    const hash = hashEvidence("invoice-2024-06.pdf");
    expect(hash).toHaveLength(HASH_HEX_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the known SHA-256 of the empty string and of 'abc'", () => {
    expect(hashEvidence("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(hashEvidence("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is stable across calls", () => {
    expect(hashEvidence("meter-log")).toBe(hashEvidence("meter-log"));
  });

  it("changes for a single-character difference", () => {
    expect(hashEvidence("meter-log")).not.toBe(hashEvidence("meter-loG"));
  });

  it("hashes binary content and agrees with the UTF-8 string form", () => {
    expect(hashEvidence(new Uint8Array([97, 98, 99]))).toBe(hashEvidence("abc"));
  });
});

describe("isValidHash / hashesMatch / verifyEvidence", () => {
  const hash = hashEvidence("evidence");

  it("validates well-formed digests only", () => {
    expect(isValidHash(hash)).toBe(true);
    expect(isValidHash(hash.toUpperCase())).toBe(false);
    expect(isValidHash(hash.slice(0, 63))).toBe(false);
    expect(isValidHash("not-a-hash")).toBe(false);
  });

  it("compares digests case-insensitively and tolerates whitespace", () => {
    expect(hashesMatch(hash, hash)).toBe(true);
    expect(hashesMatch(hash.toUpperCase(), ` ${hash} `)).toBe(true);
    expect(hashesMatch(hash, hashEvidence("other"))).toBe(false);
  });

  it("returns false rather than throwing for a malformed digest", () => {
    expect(hashesMatch(hash, "nope")).toBe(false);
    expect(hashesMatch("", "")).toBe(false);
  });

  it("verifies content against a stored digest", () => {
    expect(verifyEvidence("evidence", hash)).toBe(true);
    expect(verifyEvidence("tampered", hash)).toBe(false);
  });
});

describe("hashEvidenceManifest", () => {
  const items = [
    { id: "b", name: "Meter log", content: "meter readings 2024" },
    { id: "a", name: "Invoice", content: "invoice 2024-06" },
  ];

  it("hashes each item and computes a package hash", () => {
    const manifest = hashEvidenceManifest(items);
    expect(manifest.fileCount).toBe(2);
    expect(manifest.items.map((item) => item.id)).toEqual(["b", "a"]);
    for (const item of manifest.items) {
      expect(isValidHash(item.hash)).toBe(true);
    }
    expect(isValidHash(manifest.packageHash)).toBe(true);
  });

  it("is independent of the order the items were added", () => {
    const forwards = hashEvidenceManifest(items);
    const backwards = hashEvidenceManifest([...items].reverse());
    expect(backwards.packageHash).toBe(forwards.packageHash);
  });

  it("changes the package hash when any single item changes", () => {
    const original = hashEvidenceManifest(items).packageHash;
    const tampered = hashEvidenceManifest([
      items[0],
      { ...items[1], content: "invoice 2024-07" },
    ]).packageHash;
    expect(tampered).not.toBe(original);
  });

  it("changes the package hash when an item is added or removed", () => {
    const original = hashEvidenceManifest(items).packageHash;
    expect(
      hashEvidenceManifest([...items, { id: "c", name: "Photo", content: "jpeg-bytes" }])
        .packageHash,
    ).not.toBe(original);
    expect(hashEvidenceManifest([items[0]]).packageHash).not.toBe(original);
  });

  it("sums byte sizes, deriving them from the content when not given", () => {
    const manifest = hashEvidenceManifest(items);
    expect(manifest.items.find((i) => i.id === "a")?.fileSize).toBe(
      Buffer.byteLength("invoice 2024-06", "utf8"),
    );
    expect(manifest.totalSize).toBe(
      Buffer.byteLength("invoice 2024-06", "utf8") +
        Buffer.byteLength("meter readings 2024", "utf8"),
    );
  });

  it("accepts pre-computed hashes for content held in object storage", () => {
    const manifest = hashEvidenceManifest([
      { id: "a", name: "Remote PDF", hash: hashEvidence("remote"), fileSize: 2048 },
    ]);
    expect(manifest.items[0].hash).toBe(hashEvidence("remote"));
    expect(manifest.totalSize).toBe(2048);
  });

  it("normalises an upper-case pre-computed hash", () => {
    const manifest = hashEvidenceManifest([
      { id: "a", name: "Remote", hash: hashEvidence("remote").toUpperCase() },
    ]);
    expect(manifest.items[0].hash).toBe(hashEvidence("remote"));
  });

  it("reports an unknown total size when any item's size is unknown", () => {
    const manifest = hashEvidenceManifest([
      { id: "a", name: "Remote", hash: hashEvidence("remote") },
    ]);
    expect(manifest.totalSize).toBeNull();
  });

  it("rejects an item with neither content nor a hash, and a malformed hash", () => {
    expect(() => hashEvidenceManifest([{ id: "a", name: "Broken" }])).toThrow(ValidationError);
    expect(() =>
      hashEvidenceManifest([{ id: "a", name: "Broken", hash: "abc" }]),
    ).toThrow(/malformed SHA-256/);
  });

  it("returns an empty manifest for no items", () => {
    const manifest = hashEvidenceManifest([]);
    expect(manifest.fileCount).toBe(0);
    expect(manifest.totalSize).toBe(0);
    expect(manifest.packageHash).toBe(hashEvidence(""));
  });
});
