"use client";

import { Fragment, useMemo } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UIInvoice } from "@/app/invoices/page";
import { invoiceColumns } from "./columns";
import { currencyFormat } from "@/lib/format";

export function InvoicesTable(props: {
  initialData: UIInvoice[];
  page: number;
  pageSize: number;
  total: number;
  q: string;
}) {
  const { initialData, page, pageSize, total, q } = props;
  const router = useRouter();

  const columns = useMemo<ColumnDef<UIInvoice>[]>(() => invoiceColumns, []);

  const table = useReactTable({
    data: initialData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    initialState: {
      sorting: [{ id: "dateISO", desc: true }],
      pagination: { pageIndex: 0, pageSize },
    },
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
  });

  const handlePageChange = (next: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(next));
    url.searchParams.set("pageSize", String(pageSize));
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    router.push(url.toString());
  };

  return (
    <div className="rounded-2xl border bg-background">
      <div className="overflow-x-auto">
        <Table id="invoice-table">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="whitespace-nowrap">
                    {h.isPlaceholder
                      ? null
                      : (h.column.columnDef.header as React.ReactNode)}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="align-top">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                {/* Expansion row */}
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0 border-0">
                    <AnimatePresence initial={false}>
                      {row.getIsExpanded() && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-6 pb-6"
                        >
                          <ItemsSubTable invoice={row.original} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pager */}
      <div className="flex items-center justify-between p-4">
        <div className="text-sm text-muted-foreground">
          Page {page} of {Math.ceil(total / pageSize)} ·{" "}
          {total.toLocaleString()} rows
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => handlePageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function ItemsSubTable({ invoice }: { invoice: UIInvoice }) {
  const items = invoice.itemsPreview;
  return (
    <div className="rounded-xl border bg-muted/30">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="font-medium">
          Items · {invoice.itemsCount.toLocaleString()}
        </div>
        <Link href={`/admin/invoices/${invoice.id}`}>Open details</Link>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">List Price</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Row ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground"
                >
                  No items in preview.
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell
                    className="max-w-[320px] truncate"
                    title={it.productName ?? undefined}
                  >
                    {it.productName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {it.quantity ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {currencyFormat(it.listPrice)}
                  </TableCell>
                  <TableCell className="text-right">
                    {currencyFormat(it.discount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {currencyFormat(it.tax)}
                  </TableCell>
                  <TableCell className="text-right">
                    {currencyFormat(it.total)}
                  </TableCell>
                  <TableCell>{it.employeeId ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {it.zohoRowId}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {invoice.itemsCount > items.length && (
        <div className="p-3 text-xs text-muted-foreground">
          Showing first {items.length} items. Open details to see all.
        </div>
      )}
    </div>
  );
}
