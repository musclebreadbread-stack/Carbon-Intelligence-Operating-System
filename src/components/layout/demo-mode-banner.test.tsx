/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoModeBanner } from "./demo-mode-banner";
import { boundaryCopy, classifyBoundaryError } from "@/lib/error-boundary";

describe("DemoModeBanner", () => {
  it("renders in demo mode and names every unconfigured dependency", () => {
    render(
      <DemoModeBanner
        demoMode
        databaseConfigured={false}
        supabaseConfigured={false}
        llmConfigured={false}
        reason="DATABASE_URL is not set"
      />,
    );

    expect(screen.getByTestId("demo-mode-banner")).toBeTruthy();
    expect(screen.getByText(/every figure below is computed/i)).toBeTruthy();
    expect(screen.getByText("DATABASE_URL")).toBeTruthy();
    expect(screen.getByText("NEXT_PUBLIC_SUPABASE_URL")).toBeTruthy();
    expect(screen.getByText("OPENAI_API_KEY")).toBeTruthy();
    expect(screen.getByText(/DATABASE_URL is not set/)).toBeTruthy();
  });

  it("renders nothing when a database is reachable", () => {
    const { container } = render(
      <DemoModeBanner
        demoMode={false}
        databaseConfigured
        supabaseConfigured
        llmConfigured
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("omits the dependencies that are configured", () => {
    render(
      <DemoModeBanner
        demoMode
        databaseConfigured={false}
        supabaseConfigured
        llmConfigured
      />,
    );
    expect(screen.getByText("DATABASE_URL")).toBeTruthy();
    expect(screen.queryByText("OPENAI_API_KEY")).toBeNull();
  });

  it("links the Korean setup guide", () => {
    render(
      <DemoModeBanner
        demoMode
        databaseConfigured={false}
        supabaseConfigured={false}
        llmConfigured={false}
      />,
    );
    expect(screen.getByText("docs/CIOS-직접-설정-가이드.docx")).toBeTruthy();
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
