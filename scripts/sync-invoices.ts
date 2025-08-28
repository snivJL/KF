import fs from 'node:fs';
import csv from 'csv-parser';
import { prisma } from '@/lib/prisma';

type InvoiceRow = {
  Id: string;
  Subject?: string;
  'Invoice Date'?: string;
  'Account Name'?: string;
  'Sub Total'?: string;
  Discount?: string;
  Tax?: string;
  'Grand Total'?: string;
};

type InvoiceItemRow = {
  Id: string;
  'Parent Id': string;
  'Product Name'?: string;
  Quantity?: string;
  'List Price'?: string;
  Discount?: string;
  Tax?: string;
  Amount?: string;
  'Total After Discount'?: string;
  Total: string;
  'Assigned Employee'?: string;
};

async function loadCsv<T>(
  filePath: string,
  separator: ';' | ',',
): Promise<T[]> {
  const rows: T[] = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(
        csv({
          separator,
          mapHeaders: ({ header }) =>
            header
              .replace(/^\uFEFF/, '')
              .replace(/['"]+/g, '')
              .trim(),
        }),
      )
      .on('data', (row) => rows.push(row as T))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function parseFormattedNumber(value?: string) {
  if (!value || value === '') return null;

  // Remove dots (thousands separators) and convert to number
  const cleanValue = value.toString().replace(/\./g, '');
  const number = Number(cleanValue);

  // Return null if conversion failed (NaN)
  return Number.isNaN(number) ? null : number;
}

async function main() {
  console.log('📥 Loading invoices...');
  const invoicesRaw = await loadCsv<InvoiceRow>('Invoices.csv', ';');

  console.log('📥 Loading invoice items...');
  const itemsRaw = await loadCsv<InvoiceItemRow>('Invoices Item.csv', ';');

  console.log(
    `Loaded ${invoicesRaw.length} invoices, ${itemsRaw.length} items.`,
  );

  // Step 1: Insert invoices
  console.log('📝 Inserting invoices...');
  await prisma.invoice.createMany({
    data: invoicesRaw.map((inv) => ({
      zohoId: inv.Id,
      subject: inv.Subject || null,
      date: inv['Invoice Date'] ? new Date(inv['Invoice Date']) : null,
      accountId: inv['Account Name'],
      subtotal: parseFormattedNumber(inv['Sub Total']),
      discount: parseFormattedNumber(inv.Discount),
      tax: parseFormattedNumber(inv.Tax),
      grandTotal: parseFormattedNumber(inv['Grand Total']),
      contentHash: '',
    })),
    skipDuplicates: true,
  });
  // Step 2: Build invoiceId map
  console.log('🔗 Building invoice ID map...');
  const dbInvoices = await prisma.invoice.findMany({
    select: { id: true, zohoId: true },
  });
  const invoiceMap = new Map(dbInvoices.map((i) => [i.zohoId, i.id]));

  // Step 3: Insert invoice items
  console.log('📝 Inserting items...');

  await prisma.invoiceItem.createMany({
    data: itemsRaw.map((it) => ({
      zohoRowId: it.Id,
      invoiceId: invoiceMap.get(it['Parent Id']) || 'NOT FOUND',
      productId: it['Product Name'] || null,
      quantity: parseFormattedNumber(it.Quantity),
      listPrice: parseFormattedNumber(it['List Price']),
      discount: parseFormattedNumber(it.Discount),
      tax: parseFormattedNumber(it.Tax),
      amount: parseFormattedNumber(it.Amount),
      total: parseFormattedNumber(it.Total),
      employeeId: it['Assigned Employee'] || null,
      contentHash: '', // optional: compute hash if needed
    })),
    skipDuplicates: true,
  });

  console.log('✅ Import complete!');
}

main()
  .catch((err) => {
    console.error('❌ Import failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
