import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeNumber, pad7 } from '@/lib/invoices';
import { getValidAccessTokenFromServer } from '@/lib/auth-server';
import {
  clearSubform,
  updateInvoice,
  deleteInvoice,
  insertInvoice,
} from '@/lib/zoho/invoices.api';
import { z } from 'zod';
import { asyncPool } from '@/lib/zoho/api';
import { parseAxiosError } from '@/lib/errors';
import {
  parseInvoicesWorkbookArrayBuffer,
  generateErrorReport,
  type ErrorRow,
  type InvoiceGroup,
} from '@/lib/upload-invoices/utils';

const SHEET_NAME = 'Template Invoice Creation ';
const CONCURRENCY = 3;

type ResultItem = {
  externalKey: string;
  crmId?: string;
  status: 'created' | 'updated' | 'deleted' | 'voided' | 'skipped' | 'error';
  error?: string;
  details?: Record<string, unknown>;
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
    let headers: string[];
    let groups: Map<string, InvoiceGroup>;
    let invoices: InvoiceGroup[];
    let ym: string;
    try {
      const parsed = parseInvoicesWorkbookArrayBuffer(ab, SHEET_NAME);
      headers = parsed.headers;
      groups = parsed.groups;
      invoices = parsed.invoices;
      ym = parsed.ym;
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 },
      );
    }

    const links = await prisma.invoiceLink.findMany({
      where: { ym },
    });

    const linkMap = new Map(links.map((l) => [l.externalKey, l]));
    const inFile = new Set(invoices.map((i) => i.externalKey));
    const toCreate = invoices.filter((i) => !linkMap.has(i.externalKey));
    const toUpdate = invoices.filter(
      (i) =>
        linkMap.has(i.externalKey) &&
        linkMap.get(i.externalKey)?.contentHash !== i.contentHash,
    );
    const toRemove = links.filter((l) => !inFile.has(l.externalKey));

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
          Quantity: normalizeNumber(r.quantity, 2),
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
    const groupByKey = groups;

    // CREATE
    await asyncPool(CONCURRENCY, toCreate, async (g) => {
      try {
        const record = payloadForGroup(g);
        const crmId = await insertInvoice(token, record);
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
        const { message, details } = parseAxiosError(e);

        errors.push({
          externalKey: g.externalKey,
          status: 'skipped',
          error: message,
          details,
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
        const { message, details } = parseAxiosError(e);
        errors.push({
          externalKey: g.externalKey,
          status: 'skipped',
          error: message,
          details,
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

    // Build Excel error report if any
    let errorReport: { fileName: string; mime: string; base64: string } | null =
      null;
    if (errors.length > 0) {
      const errorRows: ErrorRow[] = errors.flatMap((er) =>
        deriveErrorRows(er, groupByKey.get(er.externalKey)),
      );
      errorReport = generateErrorReport(headers, groups, errorRows);
    }

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
      errorReport,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

function friendlyZohoMessage(
  details: Record<string, unknown> | undefined,
  fallback: string,
): string {
  const jsonPath = String((details as any)?.json_path ?? '');
  const apiName = String((details as any)?.api_name ?? '');
  if (apiName === 'id' && /Assigned_Employee\.id/.test(jsonPath)) {
    return 'employee does not exist';
  }
  if (apiName === 'id' && /Product_Name\.id/.test(jsonPath)) {
    return 'product does not exist';
  }
  return fallback || 'Unknown error';
}

function deriveErrorRows(
  err: ResultItem,
  g: InvoiceGroup | undefined,
): ErrorRow[] {
  const rows: ErrorRow[] = [];
  if (!g) {
    rows.push({
      rowNumber: 0,
      invoiceDId: 'unknown',
      externalKey: err.externalKey,
      message: err.error ?? 'Unknown error',
    });
    return rows;
  }

  const rawMessage = err.error ?? 'Unknown error';
  const details = err.details as Record<string, unknown> | undefined;

  // Zoho json_path → item index → row number
  const jsonPath = String((details as any)?.json_path ?? '');
  const m = jsonPath.match(/Invoiced_Items\[(\d+)\]/);
  if (m) {
    const idx = Number(m[1]);
    const rowNum = g.rows[idx]?.rowNumber ?? g.rows[0]?.rowNumber ?? 0;
    rows.push({
      rowNumber: rowNum,
      invoiceDId: g.invoiceDId,
      externalKey: err.externalKey,
      message: friendlyZohoMessage(details, rawMessage),
    });
    return rows;
  }

  // Map known thrown errors
  let matched = false;
  let codeMatch = rawMessage.match(/Employee code not found: (\S+) in/);
  if (codeMatch) {
    matched = true;
    const code = codeMatch[1];
    const affected = g.rows.filter((r) => r.employeeCode === code);
    const msg = `employee does not exist (code ${code})`;
    (affected.length ? affected : [g.rows[0]]).forEach((r) =>
      rows.push({
        rowNumber: r.rowNumber,
        invoiceDId: g.invoiceDId,
        externalKey: err.externalKey,
        message: msg,
      }),
    );
  }
  codeMatch = rawMessage.match(/Product code not found: (\S+) in/);
  if (codeMatch) {
    matched = true;
    const code = codeMatch[1];
    const affected = g.rows.filter((r) => r.productCode === code);
    const msg = `product does not exist (code ${code})`;
    (affected.length ? affected : [g.rows[0]]).forEach((r) =>
      rows.push({
        rowNumber: r.rowNumber,
        invoiceDId: g.invoiceDId,
        externalKey: err.externalKey,
        message: msg,
      }),
    );
  }
  if (/Account code not found:/.test(rawMessage)) {
    matched = true;
    const msg = 'account does not exist';
    g.rows.forEach((r) =>
      rows.push({
        rowNumber: r.rowNumber,
        invoiceDId: g.invoiceDId,
        externalKey: err.externalKey,
        message: msg,
      }),
    );
  }

  if (!matched) {
    rows.push({
      rowNumber: g.rows[0]?.rowNumber ?? 0,
      invoiceDId: g.invoiceDId,
      externalKey: err.externalKey,
      message: rawMessage,
    });
  }

  return rows;
}
