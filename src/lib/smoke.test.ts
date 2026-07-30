import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("test runner", () => {
  it("is wired up", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves the @/* path alias", () => {
    expect(cn("a", "b")).toBe("a b");
  });
});
