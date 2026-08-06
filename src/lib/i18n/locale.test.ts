import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => cookieGet(name) }),
}));

import { LOCALE_COOKIE, resolveLocale } from "./locale";

beforeEach(() => {
  cookieGet.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveLocale", () => {
  it("defaults to en when no cookie is set", async () => {
    cookieGet.mockReturnValue(undefined);
    expect(await resolveLocale()).toBe("en");
    expect(cookieGet).toHaveBeenCalledWith(LOCALE_COOKIE);
  });

  it("returns ko when the cookie is set to ko", async () => {
    cookieGet.mockReturnValue({ value: "ko" });
    expect(await resolveLocale()).toBe("ko");
  });

  it("falls back to en for a forged or unrecognised cookie value", async () => {
    cookieGet.mockReturnValue({ value: "fr" });
    expect(await resolveLocale()).toBe("en");
  });
});
