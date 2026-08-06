import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (...args: unknown[]) => cookieSet(...args) }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

import { LOCALE_COOKIE } from "@/lib/i18n/locale";

import { setLocaleAction } from "./locale";

beforeEach(() => {
  cookieSet.mockReset();
  revalidatePath.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setLocaleAction", () => {
  it("persists a valid locale and revalidates the layout", async () => {
    const state = await setLocaleAction("ko");

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.locale).toBe("ko");
    expect(cookieSet).toHaveBeenCalledWith(
      LOCALE_COOKIE,
      "ko",
      expect.objectContaining({ path: "/" }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects a value outside the supported locale list without touching the cookie", async () => {
    const state = await setLocaleAction("fr");

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects a non-string input", async () => {
    const state = await setLocaleAction(42);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
