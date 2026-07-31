/**
 * Request proxy (renamed from middleware for Next 16).
 *
 * Pins: the exported `proxy` function delegates to the session refresh utility, the
 * matcher excludes static assets and images, and the expected named export exists.
 */

import { describe, expect, it, vi } from "vitest";

const updateSession = vi.fn().mockResolvedValue(new Response());

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (req: unknown) => updateSession(req),
}));

import { config, proxy } from "./proxy";

describe("proxy (renamed middleware)", () => {
  it("delegates to updateSession", async () => {
    const request = new Request("https://app.example.com/dashboard");
    await proxy(request as never);
    expect(updateSession).toHaveBeenCalledWith(request);
  });

  it("returns the response from updateSession", async () => {
    const expected = new Response(null, { status: 200 });
    updateSession.mockResolvedValueOnce(expected);
    const result = await proxy(new Request("https://app.example.com/") as never);
    expect(result).toBe(expected);
  });

  it("excludes static and image paths from the matcher pattern", () => {
    const pattern = config.matcher[0];
    expect(pattern).toBeDefined();
    // The pattern is a Next.js path-to-regexp style that negates these prefixes;
    // validate by checking the literal exclusion substrings are present.
    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("_next/image");
    expect(pattern).toContain("favicon.ico");
    expect(pattern).toContain("svg|png|jpg|jpeg|gif|webp");
  });
});
