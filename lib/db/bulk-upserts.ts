import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

type InvoiceUpsertRow = {
  zohoId: string;
  subject: string | null;
  date: string | null; // ISO
  accountId: string | null; // FK to Account.id (Zoho id)
  subtotal: string | null; // decimal as string
  discount: string | null;
  tax: string | null;
  grandTotal: string | null;
  currency: string | null;
  status: string | null;
  contentHash: string;
};

type InvoiceItemUpsertRow = {
  zohoRowId: string;
  invoiceZohoId: string; // join to Invoice by zohoId
  productId: string | null; // FK to Product.id (Zoho id)
  productName: string | null;
  quantity: string | null;
  listPrice: string | null;
  discount: string | null;
  tax: string | null;
  amount: string | null;
  total: string | null;
  employeeId: string | null; // FK to Employee.id (Zoho id) — set directly
  employeeZohoId: string | null;
  contentHash: string;
};

export async function bulkUpsertInvoices(
  rows: InvoiceUpsertRow[],
  batchSize = 2000
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    // JSONB -> recordset for a single INSERT ... ON CONFLICT
    await prisma.$executeRaw`
      WITH payload AS (
        SELECT *
        FROM jsonb_to_recordset(${Prisma.jsonb(chunk)}) AS
        x(
          "zohoId" text,
          subject text,
          date timestamptz,
          "accountId" text,
          subtotal numeric,
          discount numeric,
          tax numeric,
          "grandTotal" numeric,
          currency text,
          status text,
          "contentHash" text
        )
      )
      INSERT INTO "Invoice"
        ("zohoId","subject","date","accountId","subtotal","discount","tax","grandTotal","currency","status","contentHash")
      SELECT
        "zohoId", subject, date, "accountId", subtotal, discount, tax, "grandTotal", currency, status, "contentHash"
      FROM payload
      ON CONFLICT ("zohoId") DO UPDATE SET
        subject = EXCLUDED.subject,
        date = EXCLUDED.date,
        "accountId" = EXCLUDED."accountId",
        subtotal = EXCLUDED.subtotal,
        discount = EXCLUDED.discount,
        tax = EXCLUDED.tax,
        "grandTotal" = EXCLUDED."grandTotal",
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        "contentHash" = EXCLUDED."contentHash";
    `;
    written += chunk.length;
  }
  return written;
}

export async function bulkUpsertInvoiceItems(
  rows: InvoiceItemUpsertRow[],
  batchSize = 2000
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    await prisma.$executeRaw`
      WITH payload AS (
        SELECT *
        FROM jsonb_to_recordset(${Prisma.jsonb(chunk)}) AS
        x(
          "zohoRowId" text,
          "invoiceZohoId" text,
          "productId" text,
          "productName" text,
          quantity numeric,
          "listPrice" numeric,
          discount numeric,
          tax numeric,
          amount numeric,
          total numeric,
          "employeeId" text,
          "employeeZohoId" text,
          "contentHash" text
        )
      ),
      resolved_invoice AS (
        SELECT p.*, i.id AS "invoiceId"
        FROM payload p
        JOIN "Invoice" i ON i."zohoId" = p."invoiceZohoId"
      )
      INSERT INTO "InvoiceItem"
        ("zohoRowId","invoiceId","productId","productName","quantity","listPrice",
         "discount","tax","amount","total","employeeId","employeeZohoId","contentHash")
      SELECT
        "zohoRowId","invoiceId","productId","productName","quantity","listPrice",
        "discount","tax","amount","total","employeeId","employeeZohoId","contentHash"
      FROM resolved_invoice
      ON CONFLICT ("zohoRowId") DO UPDATE SET
        "productId" = EXCLUDED."productId",
        "productName" = EXCLUDED."productName",
        quantity = EXCLUDED.quantity,
        "listPrice" = EXCLUDED."listPrice",
        discount = EXCLUDED.discount,
        tax = EXCLUDED.tax,
        amount = EXCLUDED.amount,
        total = EXCLUDED.total,
        "employeeId" = EXCLUDED."employeeId",
        "employeeZohoId" = EXCLUDED."employeeZohoId",
        "contentHash" = EXCLUDED."contentHash";
    `;
    written += chunk.length;
  }
  return written;
}
