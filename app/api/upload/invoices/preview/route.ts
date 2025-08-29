import { type NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { format, isValid, parseISO } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  buildInvoiceHash,
  isoFromExcelCell,
  makeExternalKey,
  tryParseNumber,
  normalizeNumber,
} from '@/lib/invoices';

const SHEET_NAME = 'Template Invoice Creation ';

const schema = z.object({
  file: z.instanceof(File),
  mode: z.enum(['delete', 'void']).optional().default('delete'),
});

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File;
    const validationResult = schema.safeParse({ file, mode: form.get('mode') });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.message },
        { status: 400 },
      );
    }

    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab);
    const ws = wb.Sheets[SHEET_NAME];
    if (!ws)
      return NextResponse.json(
        { error: `Sheet "${SHEET_NAME}" not found` },
        { status: 400 },
      );

    // Read raw arrays to keep all columns for hashing
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
    }) as unknown[][];
    if (!rows.length)
      return NextResponse.json({ error: 'Empty sheet' }, { status: 400 });

    // Find header row – use first containing "Invoice D. ID"
    let headerRowIdx = rows.findIndex((r) =>
      (r ?? []).includes('Invoice D. ID'),
    );
    if (headerRowIdx === -1) headerRowIdx = 0;
    const headers = (rows[headerRowIdx] ?? []).map((h) => String(h));
    const dataRows = rows.slice(headerRowIdx + 1).filter((r) => r?.length);

    const idx = (name: string) => headers.indexOf(name);
    const required = [
      'Invoice D. ID',
      'Invoice Date',
      'Account Code',
      'Employee Code',
      'Product Code',
      'Quantity',
      'List Price per unit (-VAT)',
      'Total Discount on item',
    ];
    for (const c of required) {
      if (idx(c) === -1) {
        return NextResponse.json(
          { error: `Missing required column: ${c}` },
          { status: 400 },
        );
      }
    }

    type RowPick = {
      invoiceDId: string;
      invoiceDate: string;
      accountCode: string;
      employeeCode: string;
      productCode: string;
      quantity: number;
      unitPrice: number;
      itemDiscount: number;
    };
    type InvoiceGroup = {
      ym: string;
      externalKey: string;
      invoiceDId: string;
      invoiceDate: string;
      accountCode: string;
      rows: (RowPick & { raw: unknown[] })[];
      contentHash: string;
    };

    const groups = new Map<string, InvoiceGroup>();
    let currentGroup: InvoiceGroup | null = null;
    // Track occurrences for repeated external key bases appearing in non-consecutive blocks
    const occurrenceMap = new Map<string, number>();

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      const invoiceDId = String(r[idx('Invoice D. ID')] ?? '').trim();
      const invoiceDate = isoFromExcelCell(r[idx('Invoice Date')]);
      const date = parseISO(invoiceDate);

      if (!isValid(date)) {
        continue;
      }

      const accountCode = String(r[idx('Account Code')] ?? '').trim();
      const row: RowPick & { raw: unknown[] } = {
        invoiceDId,
        invoiceDate,
        accountCode,
        employeeCode: String(r[idx('Employee Code')] ?? '').trim(),
        productCode: String(r[idx('Product Code')] ?? '').trim(),
        quantity: normalizeNumber(tryParseNumber(r[idx('Quantity')]) ?? 0, 2),
        unitPrice: normalizeNumber(
          tryParseNumber(r[idx('List Price per unit (-VAT)')]) ?? 0,
          2,
        ),
        itemDiscount: normalizeNumber(
          tryParseNumber(r[idx('Total Discount on item')]) ?? 0,
          2,
        ),
        raw: r,
      };

      // We only group when the same invoiceDId appears on subsequent (consecutive) rows
      const prevRow = i > 0 ? dataRows[i - 1] : null;
      const prevInvoiceDId = prevRow
        ? String(prevRow[idx('Invoice D. ID')] ?? '').trim()
        : null;
      const shouldStartNewGroup = i === 0 || prevInvoiceDId !== invoiceDId;
      if (shouldStartNewGroup) {
        const { ym, key: baseKey } = makeExternalKey(invoiceDId, invoiceDate);
        // Base key per occurrence (same invoiceDId can appear in multiple non-consecutive blocks)
        const base = `${baseKey}:${accountCode}`;
        const nextIdx = (occurrenceMap.get(base) ?? 0) + 1;
        occurrenceMap.set(base, nextIdx);
        // Suffix index only when it is not the first occurrence to preserve legacy keys
        const key = nextIdx > 1 ? `${base}:${nextIdx}` : base;

        currentGroup = {
          ym,
          externalKey: key,
          invoiceDId,
          invoiceDate,
          accountCode,
          rows: [],
          contentHash: '', // fill later
        };
        groups.set(key, currentGroup);
      }

      currentGroup?.rows.push(row);
    }

    // Compute hashes using first 8 columns only (stable subset)
    for (const g of groups.values()) {
      const groupRows = g.rows.map((rr) => rr.raw);
      g.contentHash = buildInvoiceHash(headers, groupRows, { columnLimit: 8 });
    }

    const invoices = Array.from(groups.values());
    const ym = invoices[0]?.ym ?? format(new Date(), 'yyyyMM');

    const links = await prisma.invoiceLink.findMany({ where: { ym } });
    const linkMap = new Map(links.map((l) => [l.externalKey, l]));
    const inFile = new Set(invoices.map((i) => i.externalKey));

    const toCreate = invoices.filter((i) => !linkMap.has(i.externalKey));
    const toUpdate = invoices.filter(
      (i) =>
        linkMap.has(i.externalKey) &&
        linkMap.get(i.externalKey)?.contentHash !== i.contentHash,
    );
    const unchanged = invoices.filter(
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
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
