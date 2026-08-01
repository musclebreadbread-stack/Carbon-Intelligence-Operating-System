/** @vitest-environment jsdom */

/**
 * Accessibility tests using axe-core.
 *
 * Checks representative UI components for WCAG 2.1 level AA violations.
 * Serious and critical violations must be zero.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getViolations } from "./axe-helper";

import { MobileDrawer } from "./layout/mobile-drawer";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

describe("accessibility (axe-core)", () => {
  it("Button component has no serious/critical violations", async () => {
    const { container } = render(
      <main>
        <Button>테스트 버튼</Button>
        <Button variant="outline">아웃라인</Button>
        <Button variant="destructive">삭제</Button>
      </main>,
    );
    const violations = await getViolations(container);
    const serious = violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  it("form elements with labels have no violations", async () => {
    const { container } = render(
      <main>
        <form>
          <div>
            <Label htmlFor="test-email">이메일</Label>
            <Input id="test-email" type="email" placeholder="test@example.com" />
          </div>
          <div>
            <Label htmlFor="test-name">이름</Label>
            <Input id="test-name" type="text" />
          </div>
        </form>
      </main>,
    );
    const violations = await getViolations(container);
    const serious = violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  it("Card component has no serious/critical violations", async () => {
    const { container } = render(
      <main>
        <Card>
          <CardHeader>
            <CardTitle>테스트 카드</CardTitle>
          </CardHeader>
          <CardContent>
            <p>카드 본문 내용</p>
          </CardContent>
        </Card>
      </main>,
    );
    const violations = await getViolations(container);
    const serious = violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  it("MobileDrawer has accessible button and navigation", async () => {
    const { container } = render(
      <main>
        <MobileDrawer>
          <nav>
            <a href="/dashboard">대시보드</a>
            <a href="/settings">설정</a>
          </nav>
        </MobileDrawer>
      </main>,
    );
    const violations = await getViolations(container);
    const serious = violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  it("skip link pattern is accessible", async () => {
    const { container } = render(
      <div>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4"
        >
          Skip to content
        </a>
        <main id="main-content">
          <h1>페이지 제목</h1>
          <p>본문 내용</p>
        </main>
      </div>,
    );
    const violations = await getViolations(container);
    const serious = violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });
});
