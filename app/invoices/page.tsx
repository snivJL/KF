import { prisma } from "@/lib/prisma";
import { z } from "zod";
import React from "react";
import { InvoicesTable } from "@/components/invoices/data-table";
import Header from "@/components/invoices/table-header";

export type UIInvoiceItem = {
  id: string;
  zohoRowId: string;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  listPrice: number | null;
  discount: number | null;
  tax: number | null;
  amount: number | null;
  total: number | null;
  employeeId: string | null;
  employeeZohoId: string | null;
};

export type UIInvoice = {
  id: string;
  zohoId: string;
  subject: string | null;
  dateISO: string | null;
  accountId: string | null;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  grandTotal: number | null;
  currency: string | null;
  status: string | null;
  itemsCount: number;
  itemsPreview: UIInvoiceItem[];
};

const SearchParamsSchema = z.object({
  q: z.string().optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(10).max(200).optional().default(50),
});

export default async function AdminInvoicesPage(props: {
  searchParams?: Record<string, string | string[]>;
}) {
  const { q, page, pageSize } = SearchParamsSchema.parse(
    Object.fromEntries(
      Object.entries(props.searchParams ?? {}).map(([k, v]) => [
        k,
        Array.isArray(v) ? v[0] : v,
      ])
    )
  );

  const where = q
    ? {
        OR: [
          { subject: { contains: q, mode: "insensitive" as const } },
          { zohoId: { contains: q } },
          { accountId: { contains: q } },
        ],
      }
    : {};

  // Fetch page of invoices with an items preview and items count
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { items: true } },
        account: {
          select: { id: true, code: true, name: true },
        },
        items: {
          orderBy: { createdAt: "asc" },
          take: 10,
          select: {
            id: true,
            zohoRowId: true,
            productId: true,
            productName: true,
            quantity: true,
            listPrice: true,
            discount: true,
            tax: true,
            amount: true,
            total: true,
            employeeId: true,
            employeeZohoId: true,
          },
        },
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  console.log(rows[3]);
  const data: UIInvoice[] = rows.map((r) => ({
    id: r.id,
    zohoId: r.zohoId,
    subject: r.subject ?? null,
    dateISO: r.date ? r.date.toISOString() : null,
    accountId: r.accountId ?? r.account?.id ?? null,
    accountName: r.account?.name ?? null,
    accountCode: r.account?.code ?? null,
    subtotal: r.subtotal ? Number(r.subtotal) : null,
    discount: r.discount ? Number(r.discount) : null,
    tax: r.tax ? Number(r.tax) : null,
    grandTotal: r.grandTotal ? Number(r.grandTotal) : null,
    currency: r.currency ?? null,
    status: r.status ?? null,
    itemsCount: r._count.items,
    itemsPreview: r.items.map((it) => ({
      id: it.id,
      zohoRowId: it.zohoRowId,
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity ? Number(it.quantity) : null,
      listPrice: it.listPrice ? Number(it.listPrice) : null,
      discount: it.discount ? Number(it.discount) : null,
      tax: it.tax ? Number(it.tax) : null,
      amount: it.amount ? Number(it.amount) : null,
      total: it.total ? Number(it.total) : null,
      employeeId: it.employeeId,
      employeeZohoId: it.employeeZohoId,
    })),
  }));

  return (
    <div className="p-6 space-y-6">
      <Header q={q} total={total} />
      <InvoicesTable
        initialData={data}
        page={page}
        pageSize={pageSize}
        total={total}
        q={q}
      />
    </div>
  );
}
