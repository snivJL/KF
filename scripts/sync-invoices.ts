import fs from "fs";
import csv from "csv-parser";
import { prisma } from "@/lib/prisma";

type InvoiceRow = {
  zohoId: string;
  subject?: string;
  date?: string;
  accountId?: string;
  subtotal?: string;
  discount?: string;
  tax?: string;
  grandTotal?: string;
  currency?: string;
  status?: string;
};

type InvoiceItemRow = {
  zohoRowId: string;
  invoiceZohoId: string; // must match invoices.csv zohoId
  productId?: string;
  productName?: string;
  quantity?: string;
  listPrice?: string;
  discount?: string;
  tax?: string;
  amount?: string;
  total?: string;
  employeeId?: string;
  employeeZohoId?: string;
};

async function loadCsv<T>(
  filePath: string,
  separator: ";" | ","
): Promise<T[]> {
  const rows: T[] = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(
        csv({
          separator,
          mapHeaders: ({ header }) =>
            header
              .replace(/^\uFEFF/, "")
              .replace(/['"]+/g, "")
              .trim(),
        })
      )
      .on("data", (row) => rows.push(row as T))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function parseFormattedNumber(value?: string) {
  if (!value || value === "") return null;

  // Remove dots (thousands separators) and convert to number
  const cleanValue = value.toString().replace(/\./g, "");
  const number = Number(cleanValue);

  // Return null if conversion failed (NaN)
  return isNaN(number) ? null : number;
}

async function main() {
  console.log("📥 Loading invoices...");
  const invoicesRaw = await loadCsv<InvoiceRow>("invoices.csv", ";");

  console.log("📥 Loading invoice items...");
  const itemsRaw = await loadCsv<InvoiceItemRow>("invoice_items.csv", ";");

  console.log(
    `Loaded ${invoicesRaw.length} invoices, ${itemsRaw.length} items.`
  );
  console.log(
    invoicesRaw
      .map((inv) => ({
        zohoId: inv.zohoId,
        subject: inv.subject || null,
        date: inv.date ? new Date(inv.date) : null,
        accountId: inv.accountId,
        subtotal: parseFormattedNumber(inv.subtotal),
        discount: parseFormattedNumber(inv.discount),
        tax: parseFormattedNumber(inv.tax),
        grandTotal: parseFormattedNumber(inv.grandTotal),
        currency: inv.currency || null,
        status: inv.status || null,
        contentHash: "",
      }))
      .filter((i) => i.zohoId === "4518973000002358441")
  );
  // Step 1: Insert invoices
  console.log("📝 Inserting invoices...");
  await prisma.invoice.createMany({
    data: invoicesRaw.map((inv) => ({
      zohoId: inv.zohoId,
      subject: inv.subject || null,
      date: inv.date ? new Date(inv.date) : null,
      accountId: inv.accountId,
      subtotal: parseFormattedNumber(inv.subtotal),
      discount: parseFormattedNumber(inv.discount),
      tax: parseFormattedNumber(inv.tax),
      grandTotal: parseFormattedNumber(inv.grandTotal),
      currency: inv.currency || null,
      status: inv.status || null,
      contentHash: "",
    })),
    skipDuplicates: true,
  });
  // Step 2: Build invoiceId map
  console.log("🔗 Building invoice ID map...");
  const dbInvoices = await prisma.invoice.findMany({
    select: { id: true, zohoId: true },
  });
  const invoiceMap = new Map(dbInvoices.map((i) => [i.zohoId, i.id]));

  // Step 3: Insert invoice items
  console.log("📝 Inserting items...");

  await prisma.invoiceItem.createMany({
    data: itemsRaw.map((it) => ({
      zohoRowId: it.zohoRowId,
      invoiceId: invoiceMap.get(it.invoiceZohoId)!,
      productId: it.productId || null,
      productName: it.productName || null,
      quantity: parseFormattedNumber(it.quantity),
      listPrice: parseFormattedNumber(it.listPrice),
      discount: parseFormattedNumber(it.discount),
      tax: parseFormattedNumber(it.tax),
      amount: parseFormattedNumber(it.amount),
      total: parseFormattedNumber(it.total),
      employeeId: it.employeeId || null,
      contentHash: "", // optional: compute hash if needed
    })),
    skipDuplicates: true,
  });

  console.log("✅ Import complete!");
}

main()
  .catch((err) => {
    console.error("❌ Import failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
