import * as XLSX from 'xlsx';
import type { InvoiceRow } from '@/types/tedis/invoices';
import { createHash } from 'crypto';
import { format, parseISO } from 'date-fns';

export function parseInvoiceExcel(file: File): Promise<{
  data: InvoiceRow[];
  headers: string[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0] as string;
        const ws = wb.Sheets[wsname] as XLSX.WorkSheet;
        const json = XLSX.utils.sheet_to_json<InvoiceRow>(ws, { defval: '' });

        const keys = json.length > 0 ? Object.keys(json[0] as InvoiceRow) : [];
        resolve({ data: json, headers: keys });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsBinaryString(file);
  });
}

export function groupConsecutively<T extends { subject: string }>(
  items: T[],
): T[][] {
  const groups: T[][] = [];
  let currentGroup: T[] = [];

  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    const prev = items[i - 1];
    if (!prev || current.subject === prev.subject) {
      currentGroup.push(current);
    } else {
      groups.push(currentGroup);
      currentGroup = [current];
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);
  return groups;
}

// ---- Types
export type RawRow = {
  invoiceDId: string; // "Invoice D. ID"
  invoiceDate: string; // ISO yyyy-mm-dd
  employeeCode: string;
  accountCode: string;
  productCode: string;
  quantity: number;
  unitPrice: number; // -VAT
  itemDiscount: number;
};

export type InvoiceItem = {
  productCode: string;
  quantity: number;
  unitPrice: number;
  itemDiscount: number;
  employeeCode: string;
};

export type Invoice = {
  ym: string; // "20250824"
  externalKey: string; // "INV:202508:00000698"
  invoiceDId: string;
  invoiceDate: string; // yyyy-mm-dd
  accountCode: string;
  items: InvoiceItem[];
};

export const pad7 = (s: string) => s.toString().padStart(7, '0');

export function makeExternalKey(
  invoiceDId: string,
  invoiceDateISO: string,
): { ym: string; key: string } {
  const date = parseISO(invoiceDateISO);

  const ym = format(date, 'yyyyMM');
  return { ym, key: `INV:${ym}:${pad7(invoiceDId)}` };
}

function round(n: number, dp: number): number {
  const p = Math.pow(10, dp);
  return Math.round(n * p) / p;
}

function stableJson(invoice: Invoice): string {
  const header = {
    ym: invoice.ym,
    invoiceDId: pad7(invoice.invoiceDId),
    accountCode: invoice.accountCode.trim(),
    invoiceDate: invoice.invoiceDate, // already yyyy-mm
  };
  const items = [...invoice.items]
    .map((i) => ({
      productCode: i.productCode.trim(),
      quantity: round(i.quantity, 2),
      unitPrice: round(i.unitPrice, 2),
      itemDiscount: round(i.itemDiscount, 2),
      employeeCode: i.employeeCode.trim(),
    }))
    .sort(
      (a, b) =>
        a.productCode.localeCompare(b.productCode) ||
        a.unitPrice - b.unitPrice ||
        a.employeeCode.localeCompare(b.employeeCode),
    );
  return JSON.stringify({ header, items });
}

export function invoiceHash(invoice: Invoice): string {
  return createHash('sha256').update(stableJson(invoice)).digest('hex');
}

const isDateHeader = (h: string) => /date/i.test(h);
const isQtyHeader = (h: string) => /quantity|qty/i.test(h);
const isMoneyHeader = (h: string) =>
  /(price|amount|total|discount|tax|duty|rate|commission)/i.test(h);
const normStr = (v: unknown) =>
  typeof v === 'string'
    ? v.trim()
    : typeof v === 'number'
      ? String(v)
      : v == null
        ? ''
        : String(v);

export function normalizeNumber(n: number, dp: number): number {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

export function tryParseNumber(x: unknown): number | null {
  if (typeof x === 'number' && !Number.isNaN(x)) return x;
  if (typeof x === 'string') {
    const n = Number(x.replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeValueForHash(header: string, raw: unknown): Hashable {
  if (raw == null || raw === '') return null;

  // Dates → YYYY-MM-DD (Excel js gives serials or Date objects sometimes)
  if (isDateHeader(header)) {
    // Try Date instance / serial date / string date
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return raw.toISOString().slice(0, 10);
    }
    const n = tryParseNumber(raw);
    if (n != null && n > 25569) {
      // Excel serial date (days since 1899-12-30), rough handling
      const ms = Math.round((n - 25569) * 86400 * 1000);
      return new Date(ms).toISOString().slice(0, 10);
    }
    const s = normStr(raw);
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return s; // fallback
  }

  // Numbers → normalized (qty 3 dp, money 2 dp, else 4 dp generic)
  const num = tryParseNumber(raw);
  if (num != null) {
    if (isQtyHeader(header)) return normalizeNumber(num, 2);
    if (isMoneyHeader(header)) return normalizeNumber(num, 2);
    return normalizeNumber(num, 4);
  }

  // Strings → trimmed
  return normStr(raw);
}

function sortKeyFromRow(row: Record<string, Hashable>): string {
  // Prefer productCode, unitPrice, employeeCode if present; else stable JSON
  const pc = String(row['Product Code'] ?? '');
  const up =
    row['List Price per unit (-VAT)'] ?? row['Unit Price'] ?? row.Price ?? '';
  const ec = String(row['Employee Code'] ?? '');
  if (pc || up || ec) return `${pc}¤${up}¤${ec}`;
  return JSON.stringify(row);
}
type Hashable = string | number | null;

export function buildInvoiceHash(
  headers: string[],
  rowsForInvoice: unknown[][],
  opts?: { columnLimit?: number },
): string {
  const colLimit =
    opts?.columnLimit && opts.columnLimit > 0 ? opts.columnLimit : undefined;
  const effectiveHeaders = colLimit ? headers.slice(0, colLimit) : headers;

  const normalizedRows = rowsForInvoice.map((rawRow) => {
    const obj: Record<string, Hashable> = {};
    effectiveHeaders.forEach((h, i) => {
      obj[h] = normalizeValueForHash(h, rawRow[i]);
    });
    return obj;
  });

  // Sort rows for determinism
  normalizedRows.sort((a, b) =>
    sortKeyFromRow(a) > sortKeyFromRow(b) ? 1 : -1,
  );

  const json = JSON.stringify(normalizedRows);
  return createHash('sha256').update(json).digest('hex');
}

export function isoFromExcelCell(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return v.toISOString().slice(0, 10);
  const n = tryParseNumber(v);
  if (n != null && n > 25569) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = normStr(v);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // As a last resort, return as-is; validation later will fail
  return s;
}
