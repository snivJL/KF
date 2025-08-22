import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { InvoicesTable } from "@/components/invoices/data-table";
import Header from "@/components/invoices/table-header";
import { Prisma } from "@prisma/client";

export type UIInvoice = {
  id: string;
  zohoId: string;
  subject: string | null;
  dateISO: string | null;
  accountId: string | null;
  accountName: string | null;
  accountCode: string | null;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  grandTotal: number | null;
  currency: string | null;
  status: string | null;
  itemsCount: number;
  itemsPreview: UIInvoiceItem[];
};

export type UIInvoiceItem = {
  id: string;
  zohoRowId: string;
  productId: string | null;
  productName: string | null;
  productCode: string | null;
  quantity: number | null;
  listPrice: number | null;
  discount: number | null;
  tax: number | null;
  amount: number | null;
  total: number | null;
  employeeId: string | null;
  employeeCode: string | null;
};

const invoiceQuery = Prisma.validator<Prisma.InvoiceDefaultArgs>()({
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
        product: { select: { id: true, name: true, productCode: true } },
        quantity: true,
        listPrice: true,
        discount: true,
        tax: true,
        amount: true,
        total: true,
        employee: { select: { id: true, code: true } },
      },
    },
  },
});
type DatabaseInvoice = Prisma.InvoiceGetPayload<typeof invoiceQuery>;

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

  const where: Prisma.InvoiceWhereInput = q
    ? {
        OR: [
          { subject: { contains: q, mode: "insensitive" } },
          { zohoId: { contains: q } },
          { accountId: { contains: q } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      ...invoiceQuery,
    }),
    prisma.invoice.count({ where }),
  ]);

  const data: UIInvoice[] = rows.map(transformToUI);
  return (
    <div className="container mx-auto p-6 space-y-8 max-w-7xl">
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

function transformToUI(r: DatabaseInvoice): UIInvoice {
  return {
    id: r.id,
    zohoId: r.zohoId,
    subject: r.subject,
    dateISO: r.date?.toISOString() ?? null,
    accountId: r.accountId ?? r.account?.id ?? null,
    accountName: r.account?.name ?? null,
    accountCode: r.account?.code ?? null,
    subtotal: r.subtotal ? Number(r.subtotal) : null,
    discount: r.discount ? Number(r.discount) : null,
    tax: r.tax ? Number(r.tax) : null,
    grandTotal: r.grandTotal ? Number(r.grandTotal) : null,
    currency: r.currency,
    status: r.status,
    itemsCount: r._count.items,
    itemsPreview: r.items.map(
      (it): UIInvoiceItem => ({
        id: it.id,
        zohoRowId: it.zohoRowId,
        productId: it.product?.id ?? null,
        productName: it.product?.name ?? null,
        productCode: it.product?.productCode ?? null,
        quantity: it.quantity ? Number(it.quantity) : null,
        listPrice: it.listPrice ? Number(it.listPrice) : null,
        discount: it.discount ? Number(it.discount) : null,
        tax: it.tax ? Number(it.tax) : null,
        amount: it.amount ? Number(it.amount) : null,
        total: it.total ? Number(it.total) : null,
        employeeId: it.employee?.id ?? null,
        employeeCode: it.employee?.code ?? null,
      })
    ),
  };
}
