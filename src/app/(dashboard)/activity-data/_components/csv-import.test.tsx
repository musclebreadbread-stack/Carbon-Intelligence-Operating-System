/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { actionSuccess, type ActionState } from "@/lib/actions/types";

import {
  CsvImport,
  type CommitDataImportJobResult,
  guessTarget,
  parseCsvLine,
} from "./csv-import";

const activityDataOptions = [{ value: "ad-1", label: "Ulsan natural gas 2024" }];

function renderImporter(
  commitImport: (input: unknown) => Promise<ActionState<CommitDataImportJobResult>>,
  overrides: { readonly databaseConfigured?: boolean } = {},
) {
  return render(
    <CsvImport
      databaseConfigured={overrides.databaseConfigured ?? true}
      activityDataOptions={activityDataOptions}
      commitImport={commitImport}
    />,
  );
}

const CSV = "quantity,unit,startDate,endDate\n1200,m3,2024-01-01,2024-01-31\n1500,m3,2024-02-01,2024-02-29";

describe("parseCsvLine", () => {
  it("splits on commas and unwraps quoted fields", () => {
    expect(parseCsvLine('a,"b, still b",c')).toEqual(["a", "b, still b", "c"]);
  });
});

describe("guessTarget", () => {
  it("maps common header spellings onto target fields", () => {
    expect(guessTarget("Quantity")).toBe("quantity");
    expect(guessTarget("Period Start")).toBe("startDate");
    expect(guessTarget("something unrelated")).toBe("");
  });
});

describe("CsvImport", () => {
  it("disables commit until the CSV is pasted, mapped and a data set is selected", async () => {
    const commitImport = vi.fn();
    renderImporter(commitImport);

    expect(
      (screen.getByRole("button", { name: /Commit import job/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("commits every parsed row as a mapped payload once required fields resolve", async () => {
    const user = userEvent.setup();
    const commitImport = vi
      .fn<(input: unknown) => Promise<ActionState<CommitDataImportJobResult>>>()
      .mockResolvedValue(
        actionSuccess(
          { jobId: "job-1", totalRows: 2, processedRows: 2, errorRows: 0, rowErrors: [] },
          "Imported 2 row(s).",
          "action.success.commitDataImportJob",
        ),
      );
    renderImporter(commitImport);

    await user.type(screen.getByLabelText(/Or paste CSV/), CSV);
    await user.selectOptions(screen.getByLabelText(/Activity data set/), "ad-1");

    const button = screen.getByRole("button", { name: /Commit import job/ }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    await user.click(button);

    await waitFor(() => expect(commitImport).toHaveBeenCalledTimes(1));
    const payload = commitImport.mock.calls[0][0] as {
      activityDataId: string;
      rows: Record<string, string>[];
    };
    expect(payload.activityDataId).toBe("ad-1");
    expect(payload.rows).toEqual([
      { quantity: "1200", unit: "m3", startDate: "2024-01-01", endDate: "2024-01-31" },
      { quantity: "1500", unit: "m3", startDate: "2024-02-01", endDate: "2024-02-29" },
    ]);

    expect(await screen.findByTestId("csv-import-result")).toBeTruthy();
  });

  it("lists rejected rows without blocking the accepted ones from having been sent", async () => {
    const user = userEvent.setup();
    const commitImport = vi
      .fn<(input: unknown) => Promise<ActionState<CommitDataImportJobResult>>>()
      .mockResolvedValue(
        actionSuccess(
          {
            jobId: "job-1",
            totalRows: 2,
            processedRows: 1,
            errorRows: 1,
            rowErrors: [{ rowIndex: 1, errors: ["quantity: Quantity must be greater than zero"] }],
          },
          "Imported 1 of 2 row(s); 1 rejected.",
          "action.success.commitDataImportJob",
        ),
      );
    renderImporter(commitImport);

    await user.type(screen.getByLabelText(/Or paste CSV/), CSV);
    await user.selectOptions(screen.getByLabelText(/Activity data set/), "ad-1");
    await user.click(screen.getByRole("button", { name: /Commit import job/ }));

    const result = await screen.findByTestId("csv-import-result");
    expect(result.textContent).toContain("1 row(s) were rejected");
    expect(result.textContent).toContain("Row 2");
  });

  it("stays disabled without a database even when everything else is ready", async () => {
    const user = userEvent.setup();
    const commitImport = vi.fn();
    renderImporter(commitImport, { databaseConfigured: false });

    await user.type(screen.getByLabelText(/Or paste CSV/), CSV);
    await user.selectOptions(screen.getByLabelText(/Activity data set/), "ad-1");

    expect(
      (screen.getByRole("button", { name: /Commit import job/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText("DATABASE_URL")).toBeTruthy();
  });
});
