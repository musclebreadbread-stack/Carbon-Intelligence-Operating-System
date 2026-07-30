/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { actionError, actionSuccess, type ActionState } from "@/lib/actions/types";

import { EntryForm, type CreateEntryResult } from "./entry-form";

const activityDataOptions = [{ value: "ad-1", label: "Ulsan natural gas 2024" }];
const emissionSourceOptions = [{ value: "src-1", label: "Boiler #1" }];
const unitOptions = [
  { value: "Nm3", label: "Nm3" },
  { value: "kWh", label: "kWh — Kilowatt hour" },
];

function renderForm(
  createEntry: (input: unknown) => Promise<ActionState<CreateEntryResult>>,
) {
  return render(
    <EntryForm
      activityDataOptions={activityDataOptions}
      emissionSourceOptions={emissionSourceOptions}
      unitOptions={unitOptions}
      createEntry={createEntry}
    />,
  );
}

async function fillValidPeriod(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Period start/), "2024-03-01");
  await user.type(screen.getByLabelText(/Period end/), "2024-03-31");
}

describe("EntryForm", () => {
  it("rejects a negative quantity client-side and never calls the action", async () => {
    const user = userEvent.setup();
    const createEntry = vi.fn();
    renderForm(createEntry);

    await user.type(screen.getByLabelText(/Quantity/), "-5");
    await fillValidPeriod(user);
    await user.click(screen.getByRole("button", { name: /Save entry/ }));

    expect(
      await screen.findByText("Quantity must be greater than zero"),
    ).toBeTruthy();
    expect(createEntry).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", async () => {
    const user = userEvent.setup();
    const createEntry = vi.fn();
    renderForm(createEntry);

    await user.type(screen.getByLabelText(/Quantity/), "100");
    await user.type(screen.getByLabelText(/Period start/), "2024-03-31");
    await user.type(screen.getByLabelText(/Period end/), "2024-03-01");
    await user.click(screen.getByRole("button", { name: /Save entry/ }));

    expect(
      await screen.findByText("End date must be on or after the start date"),
    ).toBeTruthy();
    expect(createEntry).not.toHaveBeenCalled();
  });

  it("submits a valid entry with coerced types", async () => {
    const user = userEvent.setup();
    const createEntry = vi.fn<(input: unknown) => Promise<ActionState<CreateEntryResult>>>(async () =>
      actionSuccess(
        { id: "entry-1", ruleFlags: [] },
        "Entry saved.",
        "action.success.createActivityEntry",
      ),
    );
    renderForm(createEntry);

    await user.type(screen.getByLabelText(/Quantity/), "1250.5");
    await fillValidPeriod(user);
    await user.click(screen.getByRole("button", { name: /Save entry/ }));

    await waitFor(() => expect(createEntry).toHaveBeenCalledTimes(1));
    const payload = createEntry.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.quantity).toBe(1250.5);
    expect(payload.activityDataId).toBe("ad-1");
    expect(payload.unit).toBe("Nm3");
    expect(payload.isEstimated).toBe(false);
  });

  it("surfaces non-blocking rule flags inline after a successful save", async () => {
    const user = userEvent.setup();
    const createEntry = vi.fn<(input: unknown) => Promise<ActionState<CreateEntryResult>>>(async () =>
      actionSuccess(
        {
          id: "entry-1",
          ruleFlags: ["flag: Quantity is more than 3σ above the trailing mean"],
        },
        "Entry saved with 1 warning(s).",
        "action.success.createActivityEntry",
      ),
    );
    renderForm(createEntry);

    await user.type(screen.getByLabelText(/Quantity/), "999999");
    await fillValidPeriod(user);
    await user.click(screen.getByRole("button", { name: /Save entry/ }));

    expect(await screen.findByTestId("entry-rule-flags")).toBeTruthy();
    expect(screen.getByText(/3σ above the trailing mean/)).toBeTruthy();
  });

  it("renders a blocking rule rejection as a banner, not a field error", async () => {
    const user = userEvent.setup();
    const createEntry = vi.fn<(input: unknown) => Promise<ActionState<CreateEntryResult>>>(async () =>
      actionError(
        "VALIDATION_ERROR",
        "Quantity exceeds the plausible range for this meter.",
        "action.error.validation",
      ),
    );
    renderForm(createEntry);

    await user.type(screen.getByLabelText(/Quantity/), "100");
    await fillValidPeriod(user);
    await user.click(screen.getByRole("button", { name: /Save entry/ }));

    expect(await screen.findByTestId("entry-rejection")).toBeTruthy();
    expect(screen.getByText(/exceeds the plausible range/)).toBeTruthy();
  });

  it("maps server field errors back onto their inputs", async () => {
    const user = userEvent.setup();
    const createEntry = vi.fn<(input: unknown) => Promise<ActionState<CreateEntryResult>>>(async () =>
      actionError("VALIDATION_ERROR", "Invalid", "action.error.validation", {
        fieldErrors: { unit: ["Unit gal is not in the registry"] },
      }),
    );
    renderForm(createEntry);

    await user.type(screen.getByLabelText(/Quantity/), "100");
    await fillValidPeriod(user);
    await user.click(screen.getByRole("button", { name: /Save entry/ }));

    expect(await screen.findByText("Unit gal is not in the registry")).toBeTruthy();
    expect(screen.queryByTestId("entry-rejection")).toBeNull();
  });

  it("explains demo mode instead of reporting a failure", async () => {
    const user = userEvent.setup();
    const createEntry = vi.fn<(input: unknown) => Promise<ActionState<CreateEntryResult>>>(async () =>
      actionError(
        "DEMO_MODE",
        "No database is configured, so this change was not saved.",
        "action.error.demoMode",
      ),
    );
    renderForm(createEntry);

    await user.type(screen.getByLabelText(/Quantity/), "100");
    await fillValidPeriod(user);
    await user.click(screen.getByRole("button", { name: /Save entry/ }));

    expect(await screen.findByTestId("action-demo-mode")).toBeTruthy();
    expect(screen.getByText(/Not saved — no database is configured/)).toBeTruthy();
  });
});
