"use client";

/**
 * The one data table every module uses.
 *
 * Built on `@tanstack/react-table` with sorting, a global filter, column-visibility
 * toggles, pagination and optional row selection. There is deliberately a single
 * generic implementation rather than a bespoke table per module: eighteen pages
 * showing the same interaction affordances is the point, and a bug fixed here is
 * fixed everywhere.
 *
 * Column definitions live with the page that owns the data, so this component knows
 * nothing about emissions.
 */

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableProps<TData> = {
  readonly columns: readonly ColumnDef<TData, unknown>[];
  readonly data: readonly TData[];
  /** Placeholder for the global filter; the filter is hidden when `false`. */
  readonly searchPlaceholder?: string | false;
  readonly pageSize?: number;
  readonly enableRowSelection?: boolean;
  readonly onRowSelectionChange?: (rows: readonly TData[]) => void;
  /** Rendered instead of the table body when there are no rows at all. */
  readonly emptyState?: React.ReactNode;
  readonly className?: string;
  /** Stable id, so two tables on one page do not share DOM ids. */
  readonly id?: string;
};

/** Prepends the selection checkbox column when row selection is enabled. */
function withSelectionColumn<TData>(
  columns: readonly ColumnDef<TData, unknown>[],
): ColumnDef<TData, unknown>[] {
  const selectionColumn: ColumnDef<TData, unknown> = {
    id: "__select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
      />
    ),
  };
  return [selectionColumn, ...columns];
}

export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder = "Filter rows…",
  pageSize = 10,
  enableRowSelection = false,
  onRowSelectionChange,
  emptyState,
  className,
  id,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const resolvedColumns = React.useMemo(
    () => (enableRowSelection ? withSelectionColumn(columns) : [...columns]),
    [columns, enableRowSelection],
  );

  // `react-hooks/incompatible-library` fires here and cannot be fixed in this file.
  // TanStack Table's `useReactTable()` returns an object of *methods* (`getRowModel`,
  // `getSelectedRowModel`, …) that read mutable internal state, so the React Compiler
  // cannot memoize this component without risking a stale UI and correctly declines to
  // try. That is the library's design, not a mistake here: the only "fix" would be to
  // stop using TanStack Table, and the consequence of the warning — this one component
  // is not auto-memoized — is acceptable for a table that already re-renders on every
  // sort, filter and page change.
  //
  // It is suppressed rather than left standing so `npm run lint` reports zero problems
  // and a genuinely new warning is visible instead of buried next to a permanent one.
  // The fact itself is not lost: it is recorded here, where someone changing this
  // component will read it, and in the README's architecture notes.
  // eslint-disable-next-line react-hooks/incompatible-library -- inherent to TanStack Table; see above
  const table = useReactTable({
    data: data as TData[],
    columns: resolvedColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    enableRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  // The selection callback fires from an effect rather than from
  // `onRowSelectionChange`, so the parent always sees the committed state.
  const selectedRows = table.getSelectedRowModel().rows;
  React.useEffect(() => {
    if (!onRowSelectionChange) return;
    onRowSelectionChange(selectedRows.map((row) => row.original));
    // `selectedRows` is a fresh array each render; the selection map is the
    // stable signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection]);

  const hasRows = table.getRowModel().rows.length > 0;
  const hideableColumns = table.getAllColumns().filter((column) => column.getCanHide());

  return (
    <div className={cn("space-y-3", className)} data-testid={id ?? "data-table"}>
      <div className="flex flex-wrap items-center gap-2">
        {searchPlaceholder !== false && (
          <div className="relative max-w-xs flex-1">
            <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={globalFilter}
              onChange={(event) => table.setGlobalFilter(event.target.value)}
              className="h-8 pl-7"
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {enableRowSelection && (
            <span className="text-xs text-muted-foreground">
              {selectedRows.length} of {table.getFilteredRowModel().rows.length} selected
            </span>
          )}
          {hideableColumns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Columns3 className="size-3.5" />
                    Columns
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
                    closeOnClick={false}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {hasRows ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={resolvedColumns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {emptyState ?? "No rows match the current filter."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          {" · "}
          {table.getFilteredRowModel().rows.length} row
          {table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export type { ColumnDef };
