/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LocaleProvider, useLocale, useSetLocale } from "./locale-provider";

function Probe() {
  const locale = useLocale();
  const setLocale = useSetLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <button type="button" onClick={() => setLocale("ko")}>
        switch
      </button>
    </div>
  );
}

describe("LocaleProvider", () => {
  it("supplies the initial locale to consumers", () => {
    render(
      <LocaleProvider initialLocale="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
  });

  it("updates every consumer when setLocale is called", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="en">
        <Probe />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "switch" }));

    expect(screen.getByTestId("locale").textContent).toBe("ko");
  });

  it("defaults to en outside a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("locale").textContent).toBe("en");
  });
});
