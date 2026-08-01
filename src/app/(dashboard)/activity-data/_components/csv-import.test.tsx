/** @vitest-environment jsdom */

/**
 * CSV import panel.
 *
 * The commit button used to be permanently disabled because no server action existed
 * (defect 2). These tests exercise the whole submit path the UI never had: the button
 * becomes usable once the mapping is complete, the payload sent carries the *raw* rows
 * and the confirmed mapping rather than client-built entries, the row-level failures
 * the action reports are rendered per row and field, and a demo-mode refusal is shown
 * as an explanation rather than leaving a dead control.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { actionError, actionSuccess, type ActionState } from "@/lib/actions/types";
import type { ImportActivityDataResult } from "@/lib/actions/activity-data";

import { CsvImport } from "./csv-import";

/** The action's call signature, so `mock.calls[0][0]` is typed as the payload. */
type ImportActivityData = (
  input: unknown,
) => Promise<ActionState<ImportActivityDataResult>>;

const activityDataOptions = [{ value: "ad-1", label: "Ulsan natural gas (2024)" }];

const VALID_CSV = [
  "quantity,unit,startDate,endDate",
  "1200,kWh,2024-01-01,2024-01-31",
  "1350,kWh,2024-02-01,2024-02-29",
].join("\n");

/** A header row whose names the guesser cannot resolve. */
const UNMAPPABLE_CSV = ["col1,col2", "1200,kWh"].join("\n");

function renderPanel(
  importActivityData: ImportActivityData,
  databaseConfigured = true,
) {
  return render(
    <CsvImport
      databaseConfigured={databaseConfigured}
      activityDataOptions={activityDataOptions}
      importActivityData={importActivityData}
    />,
  );
}

function success(
  overrides: Partial<ImportActivityDataResult> = {},
): ActionState<ImportActivityDataResult> {
  return actionSuccess(
    {
      jobId: "job-1",
      status: "COMPLETED",
      totalRows: 2,
      importedRows: 2,
      failedRows: 0,
      failures: [],
      truncatedFailures: false,
      ...overrides,
    },
    "Imported 2 of 2 row(s).",
    "action.success.importActivityData",
  );
}

/** Pastes a document into the textarea without typing it character by character. */
async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  const textarea = screen.getByLabelText(/Or paste CSV/);
  await user.click(textarea);
  await user.paste(text);
}

const commitButton = () =>
  screen.getByRole("button", { name: /Commit import job/ }) as HTMLButtonElement;

describe("CsvImport", () => {
  it("keeps the commit button disabled until a file has been supplied", () => {
    renderPanel(vi.fn<ImportActivityData>());

    expect(commitButton().disabled).toBe(true);
  });

  it("keeps the commit button disabled while a required column is unmapped", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn<ImportActivityData>());

    await paste(user, UNMAPPABLE_CSV);

    expect(screen.getByText(/Mapping incomplete/)).toBeTruthy();
    expect(commitButton().disabled).toBe(true);
  });

  it("enables the commit button once the guessed mapping covers every required field", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn<ImportActivityData>());

    await paste(user, VALID_CSV);

    expect(screen.getByText(/Mapping complete/)).toBeTruthy();
    expect(commitButton().disabled).toBe(false);
  });

  it("sends the raw rows and the confirmed mapping, not client-built entries", async () => {
    const user = userEvent.setup();
    const importActivityData = vi.fn<ImportActivityData>(async () => success());
    renderPanel(importActivityData);

    await paste(user, VALID_CSV);
    await user.click(commitButton());

    await waitFor(() => expect(importActivityData).toHaveBeenCalledTimes(1));
    const payload = importActivityData.mock.calls[0][0] as {
      activityDataId: string;
      mappings: readonly { sourceColumn: string; targetField: string }[];
      rows: readonly Record<string, string>[];
    };
    expect(payload.activityDataId).toBe("ad-1");
    // Raw cells, keyed by source column — the server re-derives the entries.
    expect(payload.rows).toEqual([
      { quantity: "1200", unit: "kWh", startDate: "2024-01-01", endDate: "2024-01-31" },
      { quantity: "1350", unit: "kWh", startDate: "2024-02-01", endDate: "2024-02-29" },
    ]);
    expect(payload.mappings.map((mapping) => mapping.targetField)).toEqual([
      "quantity",
      "unit",
      "startDate",
      "endDate",
    ]);
  });

  it("omits a column the user maps to ignore", async () => {
    const user = userEvent.setup();
    const importActivityData = vi.fn<ImportActivityData>(async () => success());
    renderPanel(importActivityData);

    await paste(user, `${VALID_CSV.split("\n")[0]},notes\n1200,kWh,2024-01-01,2024-01-31,hello`);
    await user.selectOptions(screen.getByLabelText("Map column notes"), "");
    await user.click(commitButton());

    await waitFor(() => expect(importActivityData).toHaveBeenCalledTimes(1));
    const payload = importActivityData.mock.calls[0][0] as {
      mappings: readonly { targetField: string }[];
    };
    expect(payload.mappings.map((mapping) => mapping.targetField)).not.toContain("notes");
  });

  it("reports a successful import with the job id and the row counts", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn<ImportActivityData>(async () => success()));

    await paste(user, VALID_CSV);
    await user.click(commitButton());

    const result = await screen.findByTestId("csv-import-result");
    expect(result.textContent).toContain("COMPLETED");
    expect(result.textContent).toContain("2 of 2 row(s) imported");
    expect(result.textContent).toContain("job-1");
  });

  it("renders each row-level validation failure with its row number and field", async () => {
    const user = userEvent.setup();
    renderPanel(
      vi.fn<ImportActivityData>(async () =>
        success({
          status: "PARTIALLY_COMPLETED",
          totalRows: 2,
          importedRows: 1,
          failedRows: 1,
          failures: [
            {
              rowNumber: 2,
              fieldErrors: { quantity: ["quantity must be greater than zero"] },
            },
          ],
        }),
      ),
    );

    await paste(user, VALID_CSV);
    await user.click(commitButton());

    const result = await screen.findByTestId("csv-import-result");
    expect(result.textContent).toContain("PARTIALLY_COMPLETED");
    expect(result.textContent).toContain("quantity");
    expect(result.textContent).toContain("quantity must be greater than zero");
    // The row number lets the user find the offending line in their own file.
    expect(result.textContent).toContain("2");
  });

  it("says the failure list was truncated when it was", async () => {
    const user = userEvent.setup();
    renderPanel(
      vi.fn<ImportActivityData>(async () =>
        success({
          status: "PARTIALLY_COMPLETED",
          failedRows: 60,
          importedRows: 1,
          failures: [{ rowNumber: 2, fieldErrors: { unit: ["Unknown unit"] } }],
          truncatedFailures: true,
        }),
      ),
    );

    await paste(user, VALID_CSV);
    await user.click(commitButton());

    const result = await screen.findByTestId("csv-import-result");
    expect(result.textContent).toContain("errorLog");
  });

  it("explains a DEMO_MODE refusal instead of disabling the button", async () => {
    // The old panel disabled the control whenever no database was configured, which
    // gave the user no way to find out why.
    const user = userEvent.setup();
    const importActivityData = vi.fn<ImportActivityData>(async () =>
      actionError(
        "DEMO_MODE",
        "No database is configured, so this change was not saved.",
        "action.error.demoMode",
      ),
    );
    renderPanel(importActivityData, false);

    await paste(user, VALID_CSV);
    expect(commitButton().disabled).toBe(false);
    await user.click(commitButton());

    await waitFor(() => expect(importActivityData).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("action-demo-mode")).toBeTruthy();
    expect(screen.queryByTestId("csv-import-result")).toBeNull();
  });

  it("surfaces a payload-level validation error", async () => {
    const user = userEvent.setup();
    renderPanel(
      vi.fn<ImportActivityData>(async () =>
        actionError(
          "VALIDATION_ERROR",
          "The submitted values are not valid",
          "action.error.validation",
          { fieldErrors: { name: ["Required"] } },
        ),
      ),
    );

    await paste(user, VALID_CSV);
    await user.click(commitButton());

    expect(await screen.findByTestId("action-validation-error")).toBeTruthy();
  });

  it("previews at most five data rows but commits all of them", async () => {
    const user = userEvent.setup();
    const importActivityData = vi.fn<ImportActivityData>(async () => success());
    renderPanel(importActivityData);

    const rows = Array.from(
      { length: 8 },
      (_, index) => `100,kWh,2024-0${index + 1}-01,2024-0${index + 1}-28`,
    );
    await paste(user, ["quantity,unit,startDate,endDate", ...rows].join("\n"));

    expect(screen.getByText(/first 5 data rows of 8/)).toBeTruthy();

    await user.click(commitButton());
    await waitFor(() => expect(importActivityData).toHaveBeenCalledTimes(1));
    const payload = importActivityData.mock.calls[0][0] as { rows: readonly unknown[] };
    expect(payload.rows).toHaveLength(8);
  });
});
