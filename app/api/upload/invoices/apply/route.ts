import { type NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { format, isValid, parseISO } from 'date-fns';
import { prisma } from '@/lib/prisma';
import {
  buildInvoiceHash,
  isoFromExcelCell,
  makeExternalKey,
  normalizeNumber,
  pad7,
  tryParseNumber,
} from '@/lib/invoices';
import { getValidAccessTokenFromServer } from '@/lib/auth-server';
import {
  upsertInvoiceByExternalKey,
  clearSubform,
  updateInvoice,
  deleteInvoice,
} from '@/lib/zoho/invoices.api';
import z from 'zod';

const SHEET_NAME = 'Template Invoice Creation ';
const CONCURRENCY = 6;

async function asyncPool<I, O>(
  limit: number,
  items: I[],
  worker: (item: I) => Promise<O>,
): Promise<O[]> {
  const ret: O[] = [];
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const p = (async () => {
      ret.push(await worker(item));
    })();
    executing.push(
      p.then(() => {
        const idx = executing.indexOf(p as unknown as Promise<void>);
        if (idx >= 0) executing.splice(idx, 1);
      }),
    );
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return ret;
}

type RowPick = {
  invoiceDId: string;
  invoiceDate: string; // ISO yyyy-mm-dd
  accountCode: string;
  employeeCode: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  itemDiscount: number;
};
type ResultItem = {
  externalKey: string;
  crmId?: string;
  status: 'created' | 'updated' | 'deleted' | 'voided' | 'skipped';
  error?: string;
};
type InvoiceGroup = {
  ym: string;
  externalKey: string;
  invoiceDId: string;
  invoiceDate: string;
  accountCode: string;
  rows: (RowPick & { raw: unknown[] })[]; // raw retained for hashing of all columns
  contentHash: string;
};

const schema = z.object({
  file: z.instanceof(File),
  mode: z.enum(['delete', 'void']).optional().default('delete'),
});

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File;
    const removeMode = String(form.get('mode') ?? 'delete') as
      | 'delete'
      | 'void';
    const validationResult = schema.safeParse({ file, removeMode });

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

    // We read as raw arrays to keep *all columns* for hashing
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
    }) as unknown[][];
    if (!rows.length)
      return NextResponse.json({ error: 'Empty sheet' }, { status: 400 });

    // Find header row – assume the first row that contains "Invoice D. ID" is the header
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

    // Group rows by external key
    const groups = new Map<string, InvoiceGroup>();
    for (const r of dataRows) {
      const invoiceDId = String(r[idx('Invoice D. ID')] ?? '').trim();
      const invoiceDate = isoFromExcelCell(r[idx('Invoice Date')]);
      const date = parseISO(invoiceDate);

      if (!isValid(date)) {
        continue;
      }

      const { ym, key } = makeExternalKey(invoiceDId, invoiceDate);
      const accountCode = String(r[idx('Account Code')] ?? '').trim();
      const row: RowPick & { raw: unknown[] } = {
        invoiceDId,
        invoiceDate,
        accountCode,
        employeeCode: String(r[idx('Employee Code')] ?? '').trim(),
        productCode: String(r[idx('Product Code')] ?? '').trim(),
        quantity: tryParseNumber(r[idx('Quantity')]) ?? 0,
        unitPrice: tryParseNumber(r[idx('List Price per unit (-VAT)')]) ?? 0,
        itemDiscount: tryParseNumber(r[idx('Total Discount on item')]) ?? 0,
        raw: r,
      };
      if (!groups.has(key)) {
        groups.set(key, {
          ym,
          externalKey: key,
          invoiceDId,
          invoiceDate,
          accountCode,
          rows: [],
          contentHash: '', // fill later
        });
      }
      groups.get(key)?.rows.push(row);
    }

    // Compute hash for each group using ALL columns (normalized)
    for (const g of groups.values()) {
      const groupRows = g.rows.map((rr) => rr.raw);
      g.contentHash = buildInvoiceHash(headers, groupRows);
    }

    const invoices = Array.from(groups.values());
    const ym = invoices[0]?.ym ?? format(new Date(), 'yyyyMM');

    const links = await prisma.invoiceLink.findMany({
      where: { ym },
    });

    const linkMap = new Map(links.map((l) => [l.externalKey, l]));
    console.log('linkMap', [...linkMap]);
    const inFile = new Set(invoices.map((i) => i.externalKey));
    console.log('inFile', [...inFile]);

    const toCreate = invoices.filter((i) => !linkMap.has(i.externalKey));
    const toUpdate = invoices.filter(
      (i) =>
        linkMap.has(i.externalKey) &&
        linkMap.get(i.externalKey)?.contentHash !== i.contentHash,
    );
    const toRemove = links.filter((l) => !inFile.has(l.externalKey));
    // console.log('Invoices', JSON.stringify(invoices, null, 2));
    // console.log('links', JSON.stringify(links, null, 2));
    // console.log('links', JSON.stringify(links, null, 2));
    console.log(
      'To create: ',
      toCreate.length,
      'To update: ',
      toUpdate.length,
      'To remove: ',
      toRemove.length,
    );

    const accountCodes = Array.from(
      new Set(invoices.map((i) => i.accountCode)),
    );
    const productCodes = Array.from(
      new Set(invoices.flatMap((i) => i.rows.map((r) => r.productCode))),
    );
    const employeeCodes = Array.from(
      new Set(invoices.flatMap((i) => i.rows.map((r) => r.employeeCode))),
    );

    const [accounts, products, employees] = await Promise.all([
      prisma.account.findMany({
        where: { code: { in: accountCodes } },
        select: { code: true, id: true, name: true },
      }),
      prisma.product.findMany({
        where: { productCode: { in: productCodes } },
        select: { productCode: true, id: true },
      }),
      prisma.employee.findMany({
        where: { code: { in: employeeCodes } },
        select: { code: true, id: true },
      }),
    ]);

    const accountMap = new Map(accounts.map((a) => [a.code, a]));
    const productMap = new Map(products.map((p) => [p.productCode, p]));
    const employeeMap = new Map(employees.map((e) => [e.code, e]));

    // Access token and base URL check
    if (!process.env.BASE_URL) {
      return NextResponse.json(
        { error: 'BASE_URL env missing' },
        { status: 500 },
      );
    }
    const token = await getValidAccessTokenFromServer();
    if (!token)
      return NextResponse.json(
        { error: 'Failed to get Zoho access token' },
        { status: 500 },
      );

    const makeSubject = (g: InvoiceGroup) => {
      const accName = accountMap.get(g.accountCode)?.code;
      return `INV ${g.ym}-${pad7(g.invoiceDId)} • ${accName}`;
    };

    const payloadForGroup = (g: InvoiceGroup) => {
      const acc = accountMap.get(g.accountCode);
      if (!acc) {
        throw new Error(
          `Account code not found: ${g.accountCode} for ${g.externalKey}`,
        );
      }
      const items = g.rows.map((r) => {
        const prod = productMap.get(r.productCode);
        const emp = employeeMap.get(r.employeeCode);
        if (!prod) {
          throw new Error(
            `Product code not found: ${r.productCode} in ${g.externalKey}`,
          );
        }
        if (!emp) {
          throw new Error(
            `Employee code not found: ${r.employeeCode} in ${g.externalKey}`,
          );
        }
        const item: Record<string, unknown> = {
          Product_Name: { id: prod.id },
          Product_Code: r.productCode,
          Quantity: normalizeNumber(r.quantity, 3),
          List_Price: normalizeNumber(r.unitPrice, 2),
          Discount: normalizeNumber(r.itemDiscount, 2),
          Assigned_Employee: { id: emp.id },
        };
        return item;
      });

      const record: Record<string, unknown> = {
        External_Invoice_Key__C: g.externalKey,
        Subject: makeSubject(g),
        Invoice_Date: g.invoiceDate, // yyyy-mm-dd
        Account_Name: { id: acc.id },
        Invoiced_Items: items,
      };

      return record;
    };

    const created: ResultItem[] = [];
    const updated: ResultItem[] = [];
    const removed: ResultItem[] = [];
    const errors: ResultItem[] = [];

    // CREATE
    await asyncPool(CONCURRENCY, toCreate, async (g) => {
      try {
        const record = payloadForGroup(g);
        const crmId = await upsertInvoiceByExternalKey(token, record);
        await prisma.invoiceLink.upsert({
          where: {
            externalKey: g.externalKey,
          },
          create: {
            ym: g.ym,
            externalKey: g.externalKey,
            crmId,
            contentHash: g.contentHash,
          },
          update: { crmId, contentHash: g.contentHash, ym: g.ym },
        });
        created.push({ externalKey: g.externalKey, crmId, status: 'created' });
      } catch (e: unknown) {
        errors.push({
          externalKey: g.externalKey,
          status: 'skipped',
          error: (e as Error).message,
        });
      }
    });

    // UPDATE
    await asyncPool(CONCURRENCY, toUpdate, async (g) => {
      if (toUpdate.length === 0) return;
      const link = linkMap.get(g.externalKey);
      if (!link) {
        throw new Error(`Invoice link not found: ${g.externalKey}`);
      }
      try {
        const record = payloadForGroup(g);
        console.log('RECORD', record);
        // Clear subform first (safe replace)return
        await clearSubform(token, link.crmId);

        await updateInvoice(token, link.crmId, { ...record, id: link.crmId });
        await prisma.invoiceLink.update({
          where: { id: link.id },
          data: { contentHash: g.contentHash, ym: g.ym },
        });
        updated.push({
          externalKey: g.externalKey,
          crmId: link.crmId,
          status: 'updated',
        });
      } catch (e: unknown) {
        errors.push({
          externalKey: g.externalKey,
          status: 'skipped',
          error: (e as Error).message,
        });
      }
    });

    // REMOVE (delete or void)
    await asyncPool(CONCURRENCY, toRemove, async (l) => {
      try {
        if (removeMode === 'delete') {
          await deleteInvoice(token, l.crmId);
          await prisma.invoiceLink.delete({ where: { id: l.id } });
          removed.push({
            externalKey: l.externalKey,
            crmId: l.crmId,
            status: 'deleted',
          });
        } else {
          await updateInvoice(token, l.crmId, { Status: 'Cancelled' });
          // keep link row for audit
          removed.push({
            externalKey: l.externalKey,
            crmId: l.crmId,
            status: 'voided',
          });
        }
      } catch (e: unknown) {
        errors.push({
          externalKey: l.externalKey,
          status: 'skipped',
          error: (e as Error).message,
        });
      }
    });

    return NextResponse.json({
      ym,
      counts: {
        created: created.length,
        updated: updated.length,
        removed: removed.length,
        errors: errors.length,
      },
      created,
      updated,
      removed,
      errors,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
