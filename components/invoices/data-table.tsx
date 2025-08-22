"use client";

import type React from "react";

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
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UIInvoice } from "@/app/invoices/page";
import { invoiceColumns } from "./columns";
import { currencyFormat } from "@/lib/format";
import { ExternalLink } from "lucide-react";

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
    getRowCanExpand: () => true,
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
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <Table id="invoice-table">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent border-b">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className="whitespace-nowrap font-semibold text-foreground h-12"
                  >
                    {h.isPlaceholder
                      ? null
                      : (h.column.columnDef.header as React.ReactNode)}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row, index) => (
              <Fragment key={row.id}>
                <TableRow
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className="hover:bg-muted/50 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="align-top py-4">
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
                          transition={{ duration: 0.2, ease: "easeInOut" }}
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
      <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20">
        <div className="text-sm text-muted-foreground">
          Showing page {page} of {Math.ceil(total / pageSize)} •{" "}
          {total.toLocaleString()} total invoices
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
            className="h-8"
          >
            Previous
          </Button>
          <div className="flex items-center gap-1 px-2">
            <span className="text-sm font-medium">{page}</span>
            <span className="text-sm text-muted-foreground">
              of {Math.ceil(total / pageSize)}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => handlePageChange(page + 1)}
            className="h-8"
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
    <div className="rounded-md border bg-background shadow-sm overflow-hidden mt-4">
      <div className="px-6 py-4 bg-muted/30 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="font-semibold text-foreground">Invoice Items</h4>
          <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full border border-primary/20">
            {invoice.itemsCount.toLocaleString()}
          </span>
        </div>
        <Link
          href={`/admin/invoices/${invoice.id}`}
          className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
        >
          View details
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b bg-muted/20">
              <TableHead className="font-semibold text-foreground h-11 px-6">
                Product
              </TableHead>
              <TableHead className="font-semibold text-foreground h-11 px-4">
                Product Code
              </TableHead>
              <TableHead className="text-right font-semibold text-foreground h-11 px-4">
                Qty
              </TableHead>
              <TableHead className="text-right font-semibold text-foreground h-11 px-4">
                List Price
              </TableHead>
              <TableHead className="text-right font-semibold text-foreground h-11 px-4">
                Discount
              </TableHead>
              <TableHead className="text-right font-semibold text-foreground h-11 px-4">
                Tax
              </TableHead>
              <TableHead className="text-right font-semibold text-foreground h-11 px-4">
                Total
              </TableHead>
              <TableHead className="font-semibold text-foreground h-11 px-4">
                Employee
              </TableHead>
              <TableHead className="font-semibold text-foreground h-11 px-4">
                Employee Code
              </TableHead>
              <TableHead className="font-semibold text-foreground h-11 px-6">
                Row ID
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-muted-foreground py-12 px-6"
                >
                  No items in preview
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => (
                <TableRow
                  key={it.id}
                  className="hover:bg-muted/40 transition-colors"
                >
                  <TableCell
                    className="max-w-[280px] truncate font-medium px-6 py-3"
                    title={it.productName ?? undefined}
                  >
                    {it.productName ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground px-4 py-3">
                    {it.productCode ?? "—"}
                  </TableCell>
                  <TableCell className="text-right px-4 py-3">
                    {it.quantity ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm px-4 py-3">
                    {currencyFormat(it.listPrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm px-4 py-3">
                    {currencyFormat(it.discount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm px-4 py-3">
                    {currencyFormat(it.tax)}
                  </TableCell>
                  <TableCell className="text-right font-semibold px-4 py-3">
                    {currencyFormat(it.total)}
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 py-3">
                    {it.employeeId ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground px-4 py-3">
                    {it.employeeCode ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground px-6 py-3">
                    {it.zohoRowId}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {invoice.itemsCount > items.length && (
        <div className="px-6 py-3 text-sm text-muted-foreground bg-muted/20 border-t">
          Showing first {items.length} of {invoice.itemsCount} items • View
          details to see all items
        </div>
      )}
    </div>
  );
}
