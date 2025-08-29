import { type NextRequest, NextResponse } from 'next/server';
// parsing and formatting moved to utils
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  parseInvoicesWorkbookArrayBuffer,
  generateErrorReport,
  type ErrorRow,
  type InvoiceGroup,
} from '@/lib/upload-invoices/utils';

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

    // 'headers', 'groups', 'invoices', 'ym' now come from parser above

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

    // Validate referentials to prepare an error report (no network calls)
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
        select: { code: true, id: true },
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

    const errorRows: ErrorRow[] = [];
    for (const g of invoices) {
      const acc = accountMap.get(g.accountCode);
      if (!acc) {
        for (const r of g.rows) {
          errorRows.push({
            rowNumber: r.rowNumber,
            invoiceDId: g.invoiceDId,
            externalKey: g.externalKey,
            message: 'account does not exist',
          });
        }
        continue; // if account invalid, items are moot but keep listing row errors above
      }
      for (const r of g.rows) {
        if (!productMap.get(r.productCode)) {
          errorRows.push({
            rowNumber: r.rowNumber,
            invoiceDId: g.invoiceDId,
            externalKey: g.externalKey,
            message: `product does not exist (code ${r.productCode})`,
          });
        }
        if (!employeeMap.get(r.employeeCode)) {
          errorRows.push({
            rowNumber: r.rowNumber,
            invoiceDId: g.invoiceDId,
            externalKey: g.externalKey,
            message: `employee does not exist (code ${r.employeeCode})`,
          });
        }
      }
    }

    const errorReport: {
      fileName: string;
      mime: string;
      base64: string;
    } | null = generateErrorReport(headers, groups, errorRows);

    return NextResponse.json({
      ym,
      counts: {
        create: toCreate.length,
        update: toUpdate.length,
        unchanged: unchanged.length,
        remove: toDeleteOrVoid.length,
        errors: errorRows.length,
      },
      samples: {
        create: toCreate.slice(0, 3).map((i) => i.externalKey),
        update: toUpdate.slice(0, 3).map((i) => i.externalKey),
        remove: toDeleteOrVoid.slice(0, 3).map((l) => l.externalKey),
      },
      errorReport,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
