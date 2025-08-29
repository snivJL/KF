import * as XLSX from 'xlsx';
import { format, isValid, parseISO } from 'date-fns';
import {
  buildInvoiceHash,
  isoFromExcelCell,
  makeExternalKey,
  normalizeNumber,
  tryParseNumber,
} from '@/lib/invoices';

export type RowPick = {
  invoiceDId: string;
  invoiceDate: string; // ISO yyyy-mm-dd
  accountCode: string;
  employeeCode: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  itemDiscount: number;
  rowNumber: number; // 1-based row number in the source sheet
};

export type InvoiceGroup = {
  ym: string;
  externalKey: string;
  invoiceDId: string;
  invoiceDate: string;
  accountCode: string;
  rows: (RowPick & { raw: unknown[] })[]; // raw retained for hashing of all columns
  contentHash: string;
};

export type ErrorRow = {
  rowNumber: number;
  message: string;
  externalKey?: string;
  invoiceDId?: string;
};

export type ParsedSheet = {
  headers: string[];
  groups: Map<string, InvoiceGroup>;
  invoices: InvoiceGroup[];
  ym: string;
};

export function parseInvoicesWorkbookArrayBuffer(
  ab: ArrayBuffer,
  sheetName: string,
): ParsedSheet {
  const wb = XLSX.read(ab);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found`);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];
  if (!rows.length) throw new Error('Empty sheet');

  let headerRowIdx = rows.findIndex((r) => (r ?? []).includes('Invoice D. ID'));
  if (headerRowIdx === -1) headerRowIdx = 0;
  const headers = (rows[headerRowIdx] ?? []).map((h) => String(h));
  const afterHeader = rows.slice(headerRowIdx + 1);
  const dataRows = afterHeader
    .map((r, j) => ({ r, rowNumber: headerRowIdx + 2 + j }))
    .filter((x) => (x.r as unknown[])?.length);

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
    if (idx(c) === -1) throw new Error(`Missing required column: ${c}`);
  }

  const groups = new Map<string, InvoiceGroup>();
  const occurrenceMap = new Map<string, number>();
  let currentGroup: InvoiceGroup | null = null;

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i].r as unknown[];
    const rowNumber = dataRows[i].rowNumber;
    const invoiceDId = String(r[idx('Invoice D. ID')] ?? '').trim();
    const invoiceDate = isoFromExcelCell(r[idx('Invoice Date')]);
    const date = parseISO(invoiceDate);
    if (!isValid(date)) continue;

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
      rowNumber,
      raw: r,
    };

    const prevRow = i > 0 ? (dataRows[i - 1].r as unknown[]) : null;
    const prevInvoiceDId = prevRow ? String(prevRow[idx('Invoice D. ID')] ?? '').trim() : null;
    const shouldStartNewGroup = i === 0 || prevInvoiceDId !== invoiceDId;
    if (shouldStartNewGroup) {
      const { ym, key: baseKey } = makeExternalKey(invoiceDId, invoiceDate);
      const base = `${baseKey}:${accountCode}`;
      const nextIdx = (occurrenceMap.get(base) ?? 0) + 1;
      occurrenceMap.set(base, nextIdx);
      const key = nextIdx > 1 ? `${base}:${nextIdx}` : base;

      currentGroup = {
        ym,
        externalKey: key,
        invoiceDId,
        invoiceDate,
        accountCode,
        rows: [],
        contentHash: '',
      };
      groups.set(key, currentGroup);
    }
    currentGroup?.rows.push(row);
  }

  for (const g of groups.values()) {
    const groupRows = g.rows.map((rr) => rr.raw);
    g.contentHash = buildInvoiceHash(headers, groupRows, { columnLimit: 8 });
  }

  const invoices = Array.from(groups.values());
  const ym = invoices[0]?.ym ?? format(new Date(), 'yyyyMM');
  return { headers, groups, invoices, ym };
}

export function generateErrorReport(
  headers: string[],
  groups: Map<string, InvoiceGroup>,
  errorRows: ErrorRow[],
): { fileName: string; mime: string; base64: string } | null {
  if (!errorRows.length) return null;
  const limitedHeaders = headers.slice(0, 8);
  const headerRow = [...limitedHeaders, 'Message', 'Row ID'];

  // Build a map rowNumber → raw row values from groups
  const rowMap = new Map<number, unknown[]>();
  for (const g of groups.values()) {
    for (const r of g.rows) {
      if (!rowMap.has(r.rowNumber)) rowMap.set(r.rowNumber, r.raw);
    }
  }

  type Agg = { messages: string[]; row: unknown[] };
  const byRow = new Map<number, Agg>();
  for (const er of errorRows) {
    const baseRow = (rowMap.get(er.rowNumber) as unknown[]) ?? [];
    const ex = byRow.get(er.rowNumber);
    if (ex) {
      if (!ex.messages.includes(er.message)) ex.messages.push(er.message);
    } else {
      byRow.set(er.rowNumber, { messages: [er.message], row: baseRow });
    }
  }

  const ordered = Array.from(byRow.entries()).sort((a, b) => a[0] - b[0]);
  const aoa: unknown[][] = [headerRow];
  for (const [rowNum, agg] of ordered) {
    const rowVals = [...agg.row].slice(0, limitedHeaders.length);
    if (rowVals.length < limitedHeaders.length) {
      rowVals.push(...Array(limitedHeaders.length - rowVals.length).fill(''));
    }
    const message = agg.messages.join('; ');
    aoa.push([...rowVals, message, rowNum]);
  }

  const wbErr = XLSX.utils.book_new();
  const wsErr = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wbErr, wsErr, 'Errors');
  const abErr = XLSX.write(wbErr, { bookType: 'xlsx', type: 'array' });
  const buf = Buffer.from(new Uint8Array(abErr as ArrayBuffer));
  const base64 = buf.toString('base64');
  return {
    fileName: `invoice-errors-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64,
  };
}

