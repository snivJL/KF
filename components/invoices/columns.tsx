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
        className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
        onClick={row.getToggleExpandedHandler()}
      >
        {row.getIsExpanded() ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
    ),
    size: 36,
  },
  {
    accessorKey: "dateISO",
    header: "Date",
    cell: ({ getValue }) => dateFormat(getValue() as string | null),
  },
  {
    accessorKey: "subject",
    header: "Subject",
    cell: ({ getValue, row }) => (
      <div
        className="max-w-[320px] truncate"
        title={(getValue() as string) ?? ""}
      >
        {(getValue() as string) ?? "—"}
      </div>
    ),
  },
  { accessorKey: "zohoId", header: "Zoho ID" },
  { accessorKey: "accountId", header: "Account ID" },
  {
    accessorKey: "itemsCount",
    header: "Items",
    cell: ({ getValue }) => (getValue() as number).toLocaleString(),
  },
  {
    accessorKey: "grandTotal",
    header: "Grand Total",
    cell: ({ row }) =>
      currencyFormat(row.original.grandTotal, row.original.currency),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];
