import { type NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  type Invoice,
  invoiceHash,
  isoFromExcelCell,
  makeExternalKey,
  type RawRow,
} from '@/lib/invoices';
import { isValid, parseISO } from 'date-fns';

const schema = z.object({
  file: z.instanceof(File),
});

export async function POST(req: NextRequest) {
  const form = await req.formData();

  const file = form.get('file') as File;
  const validationResult = schema.safeParse({ file });

  if (!validationResult.success) {
    return NextResponse.json({ error: 'Invalid file input' }, { status: 400 });
  }

  const validFile = validationResult.data.file;

  if (!validFile) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab);
  const ws = wb.Sheets['Template Invoice Creation '];
  if (!ws)
    return NextResponse.json({ error: 'Sheet not found' }, { status: 400 });

  const rows = XLSX.utils.sheet_to_json(ws, {
    range: 7,
    header: 1,
  }) as unknown[][];

  const headers = rows[0]?.map(String) ?? [];
  const dataRows = rows.slice(1);

  const idx = (name: string) => headers.indexOf(name);
  const reqCols = [
    'Invoice D. ID',
    'Invoice Date',
    'Employee Code',
    'Account Code',
    'Product Code',
    'Quantity',
    'List Price per unit (-VAT)',
    'Total Discount on item',
  ];
  for (const c of reqCols)
    if (idx(c) === -1)
      return NextResponse.json(
        { error: `Missing column: ${c}` },
        { status: 400 },
      );

  const parsed: RawRow[] = dataRows
    .filter((r) => r?.length)
    .map((r) => ({
      invoiceDId: String(r[idx('Invoice D. ID')]).trim(),
      invoiceDate: isoFromExcelCell(r[idx('Invoice Date')]),
      employeeCode: String(r[idx('Employee Code')]).trim(),
      accountCode: String(r[idx('Account Code')]).trim(),
      productCode: String(r[idx('Product Code')]).trim(),
      quantity: Number(r[idx('Quantity')]),
      unitPrice: Number(r[idx('List Price per unit (-VAT)')]),
      itemDiscount: Number(r[idx('Total Discount on item')]),
    }));
  //   console.log(parsed);
  // Group into invoices
  const byKey = new Map<string, Invoice>();

  let prevId: string | null = null; // track previous row's ID

  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    const date = parseISO(row.invoiceDate);

    if (!isValid(date)) {
      continue;
    }

    const { ym, key } = makeExternalKey(row.invoiceDId, row.invoiceDate);
    const id = key;

    if (!byKey.has(id)) {
      byKey.set(id, {
        ym,
        externalKey: key,
        invoiceDId: row.invoiceDId,
        invoiceDate: row.invoiceDate,
        accountCode: row.accountCode,
        items: [],
      });
    }

    if (prevId === id && byKey.has(id)) {
      const validatedId = byKey.get(id);
      if (!validatedId) throw new Error('Invalid map ID');
      validatedId.items.push({
        productCode: row.productCode,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        itemDiscount: row.itemDiscount,
        employeeCode: row.employeeCode,
      });
    }

    prevId = id;
  }
  //   for (const row of parsed) {
  //     const date = parseISO(row.invoiceDate);

  //     if (!isValid(date)) {
  //       continue;
  //     }
  //     const { ym, key } = makeExternalKey(row.invoiceDId, row.invoiceDate);
  //     const id = key;
  //     if (!byKey.has(id)) {
  //       byKey.set(id, {
  //         ym,
  //         externalKey: key,
  //         invoiceDId: row.invoiceDId,
  //         invoiceDate: row.invoiceDate,
  //         accountCode: row.accountCode,
  //         items: [],
  //       });
  //     }
  //     const validatedId = byKey.get(id);
  //     if (!validatedId) throw new Error('Invalid map ID');
  //     validatedId.items.push({
  //       productCode: row.productCode,
  //       quantity: row.quantity,
  //       unitPrice: row.unitPrice,
  //       itemDiscount: row.itemDiscount,
  //       employeeCode: row.employeeCode,
  //     });
  //   }

  const invoices = Array.from(byKey.values());
  const withHashes = invoices.map((inv) => ({
    ...inv,
    contentHash: invoiceHash(inv),
  }));
  console.log(withHashes);

  const ym = withHashes[0]?.ym ?? null;
  const links = ym ? await prisma.invoiceLink.findMany({ where: { ym } }) : [];

  const linkMap = new Map(links.map((l) => [l.externalKey, l]));
  const inFile = new Set(withHashes.map((i) => i.externalKey));

  const toCreate = withHashes.filter((i) => !linkMap.has(i.externalKey));
  const toUpdate = withHashes.filter(
    (i) => linkMap.get(i.externalKey)?.contentHash !== i.contentHash,
  );
  const unchanged = withHashes.filter(
    (i) => linkMap.get(i.externalKey)?.contentHash === i.contentHash,
  );
  const toDeleteOrVoid = links.filter((l) => !inFile.has(l.externalKey));

  return NextResponse.json({
    ym,
    counts: {
      create: toCreate.length,
      update: toUpdate.length,
      unchanged: unchanged.length,
      remove: toDeleteOrVoid.length,
    },
    samples: {
      create: toCreate.slice(0, 3).map((i) => i.externalKey),
      update: toUpdate.slice(0, 3).map((i) => i.externalKey),
      remove: toDeleteOrVoid.slice(0, 3).map((l) => l.externalKey),
    },
  });
}
