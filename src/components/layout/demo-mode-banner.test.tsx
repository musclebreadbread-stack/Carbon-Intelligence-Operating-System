/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { DemoModeBanner } from "./demo-mode-banner";
import { boundaryCopy, classifyBoundaryError } from "@/lib/error-boundary";

function renderBanner(
  props: Partial<React.ComponentProps<typeof DemoModeBanner>> = {},
  locale: "ko" | "en" = "ko",
) {
  const defaults = {
    demoMode: true,
    databaseConfigured: false,
    supabaseConfigured: false,
    llmConfigured: false,
  };
  return render(
    <LocaleProvider locale={locale}>
      <DemoModeBanner {...defaults} {...props} />
    </LocaleProvider>,
  );
}

describe("DemoModeBanner", () => {
  it("renders in demo mode and names every unconfigured dependency (Korean default)", () => {
    renderBanner({ reason: "DATABASE_URL is not set" });

    expect(screen.getByTestId("demo-mode-banner")).toBeTruthy();
    // Korean text from dictionary - appears in both title and badge
    expect(screen.getAllByText(/\uB370\uBAA8 \uBAA8\uB4DC/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("DATABASE_URL")).toBeTruthy();
    expect(screen.getByText("NEXT_PUBLIC_SUPABASE_URL")).toBeTruthy();
    expect(screen.getByText("OPENAI_API_KEY")).toBeTruthy();
    expect(screen.getByText(/DATABASE_URL is not set/)).toBeTruthy();
  });

  it("renders English when locale is en", () => {
    renderBanner({ reason: "DATABASE_URL is not set" }, "en");

    expect(screen.getByTestId("demo-mode-banner")).toBeTruthy();
    expect(screen.getAllByText(/Demo mode/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders nothing when a database is reachable", () => {
    const { container } = renderBanner({
      demoMode: false,
      databaseConfigured: true,
      supabaseConfigured: true,
      llmConfigured: true,
    });
    expect(container.innerHTML).toBe("");
  });

  it("omits the dependencies that are configured", () => {
    renderBanner({
      databaseConfigured: false,
      supabaseConfigured: true,
      llmConfigured: true,
    });
    expect(screen.getByText("DATABASE_URL")).toBeTruthy();
    expect(screen.queryByText("OPENAI_API_KEY")).toBeNull();
  });

  it("links the Korean setup guide", () => {
    renderBanner();
    expect(screen.getByText("docs/CIOS-\uC9C1\uC811-\uC124\uC815-\uAC00\uC774\uB4DC.docx")).toBeTruthy();
  });
});

describe("boundary error classification", () => {
  it("keeps 401 and 403 distinct", () => {
    expect(classifyBoundaryError({ message: "Sign in to continue" })).toBe("unauthorized");
    expect(
      classifyBoundaryError({ message: "FORBIDDEN: emission:write is required" }),
    ).toBe("forbidden");
  });

  it("sends 401 to sign-in and 403 to an administrator", () => {
    expect(boundaryCopy({ message: "Sign in to continue" }).actionHref).toBe("/login");
    expect(boundaryCopy({ message: "you do not have permission" }).actionHref).toBe(
      "/security",
    );
  });

  it("falls back to a retryable generic case when the message is stripped", () => {
    const copy = boundaryCopy({ message: "" }, "analytics");
    expect(copy.kind).toBe("unknown");
    expect(copy.retryable).toBe(true);
    expect(copy.title).toContain("analytics");
  });
});
