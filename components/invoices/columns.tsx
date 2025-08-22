"use client";

import type { UIInvoice } from "@/app/invoices/page";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";
import StatusBadge from "./status-badge";
import { currencyFormat, dateFormat } from "@/lib/format";

export const invoiceColumns: ColumnDef<UIInvoice>[] = [
  {
    id: "expander",
    header: "",
    cell: ({ row }) => (
      <button
        aria-label={row.getIsExpanded() ? "Collapse" : "Expand"}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
        onClick={row.getToggleExpandedHandler()}
      >
        {row.getIsExpanded() ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    ),
    size: 48,
  },
  {
    accessorKey: "dateISO",
    header: "Date",
    cell: ({ getValue }) => (
      <div className="font-medium text-sm">
        {dateFormat(getValue() as string | null)}
      </div>
    ),
  },
  {
    accessorKey: "subject",
    header: "Subject",
    cell: ({ getValue }) => (
      <div
        className="max-w-[280px] truncate font-medium"
        title={(getValue() as string) ?? ""}
      >
        {(getValue() as string) ?? "—"}
      </div>
    ),
  },
  {
    accessorKey: "zohoId",
    header: "Zoho ID",
    cell: ({ getValue }) => (
      <div className="font-mono text-xs text-muted-foreground">
        {getValue() as string}
      </div>
    ),
  },
  {
    accessorKey: "accountCode",
    header: "Account Code",
    cell: ({ getValue }) => (
      <div className="font-mono text-xs text-muted-foreground">
        {(getValue() as string) ?? "—"}
      </div>
    ),
  },
  {
    accessorKey: "accountId",
    header: "Account ID",
    cell: ({ getValue }) => (
      <div className="font-mono text-xs text-muted-foreground">
        {getValue() as string}
      </div>
    ),
  },
  {
    accessorKey: "itemsCount",
    header: "Items",
    cell: ({ getValue }) => (
      <div className="text-center">
        <span className="inline-flex items-center justify-center w-8 h-6 text-xs font-medium bg-muted rounded-full">
          {(getValue() as number).toLocaleString()}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "grandTotal",
    header: "Grand Total",
    cell: ({ row }) => (
      <div className="text-right font-semibold">
        {currencyFormat(row.original.grandTotal, row.original.currency)}
      </div>
    ),
  },
];
