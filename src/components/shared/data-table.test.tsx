/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DataTable, type ColumnDef } from "./data-table";

type Row = { readonly facility: string; readonly emissions: number };

const rows: Row[] = Array.from({ length: 14 }, (_, index) => ({
  facility: index === 0 ? "Ulsan plant" : `Facility ${index}`,
  emissions: (index + 1) * 100,
}));

const columns: ColumnDef<Row, unknown>[] = [
  { id: "facility", accessorKey: "facility", header: "Facility" },
  { id: "emissions", accessorKey: "emissions", header: "Emissions" },
];

describe("DataTable", () => {
  it("renders the first page of rows and reports the row count", async () => {
    render(<DataTable columns={columns} data={rows} pageSize={5} />);

    expect(screen.getByText("Ulsan plant")).toBeTruthy();
    expect(screen.getByText("Facility 4")).toBeTruthy();
    // Page size is 5, so row 6 is on the next page.
    expect(screen.queryByText("Facility 6")).toBeNull();
    expect(screen.getByText(/14 rows/)).toBeTruthy();
  });

  it("filters rows with the global filter", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={rows} pageSize={20} />);

    await user.type(screen.getByRole("textbox", { name: "Filter rows…" }), "Ulsan");

    expect(screen.getByText("Ulsan plant")).toBeTruthy();
    expect(screen.queryByText("Facility 4")).toBeNull();
    expect(screen.getByText(/1 row$/)).toBeTruthy();
  });

  it("paginates", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={rows} pageSize={5} />);

    expect(screen.getByText(/Page 1 of 3/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText(/Page 2 of 3/)).toBeTruthy();
    expect(screen.getByText("Facility 6")).toBeTruthy();
    expect(screen.queryByText("Ulsan plant")).toBeNull();
  });

  it("sorts on a column header", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={rows} pageSize={3} />);

    // TanStack sorts numeric columns descending on the first click, so the
    // largest value (Facility 13, 1400) leads and Ulsan (100) drops off page 1.
    await user.click(screen.getByRole("button", { name: /Emissions/ }));
    expect(screen.getByText("Facility 13")).toBeTruthy();
    expect(screen.queryByText("Ulsan plant")).toBeNull();

    // Second click reverses it: the smallest value leads.
    await user.click(screen.getByRole("button", { name: /Emissions/ }));
    expect(screen.getByText("Ulsan plant")).toBeTruthy();
    expect(screen.queryByText("Facility 13")).toBeNull();
  });

  it("renders the empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={columns}
        data={rows}
        emptyState={<span>No facilities found</span>}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Filter rows…" }), "zzzz");
    expect(screen.getByText("No facilities found")).toBeTruthy();
  });

  it("supports row selection", async () => {
    const user = userEvent.setup();
    let selected: readonly Row[] = [];
    render(
      <DataTable
        columns={columns}
        data={rows.slice(0, 3)}
        enableRowSelection
        onRowSelectionChange={(next) => {
          selected = next;
        }}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox", { name: "Select row" });
    await user.click(checkboxes[0]);
    expect(selected).toHaveLength(1);
    expect(screen.getByText("1 of 3 selected")).toBeTruthy();
  });
});
