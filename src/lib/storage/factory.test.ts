import { describe, expect, it } from "vitest";

import {
  describeStorageMode,
  getObjectStorageClient,
  getStorageMode,
  isStorageConfigured,
} from "./factory";

describe("storage factory", () => {
  it("reports unconfigured until a real provider exists (Phase B)", () => {
    expect(isStorageConfigured()).toBe(false);
    expect(getStorageMode()).toBe("memory");
    expect(describeStorageMode().mode).toBe("memory");
  });

  it("returns the same client instance across calls, so a write can be read back later", () => {
    const first = getObjectStorageClient();
    const second = getObjectStorageClient();
    expect(first).toBe(second);
  });
});
