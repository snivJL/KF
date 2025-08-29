import { logger, task } from '@trigger.dev/sdk/v3';
import { prisma } from '@/lib/prisma';
import { asyncPool } from '@/lib/zoho/api';
import {
  clearSubform,
  deleteInvoice,
  insertInvoice,
  updateInvoice,
} from '@/lib/zoho/invoices.api';
import {
  parseInvoicesWorkbookArrayBuffer,
  generateErrorReport,
  type ErrorRow,
  type InvoiceGroup,
} from '@/lib/upload-invoices/utils';
import { normalizeNumber, pad7 } from '@/lib/invoices';
import { parseAxiosError } from '@/lib/errors';

const SHEET_NAME = 'Template Invoice Creation ';
const CONCURRENCY = 3;

type ResultItem = {
  externalKey: string;
  crmId?: string;
  status: 'created' | 'updated' | 'deleted' | 'voided' | 'skipped' | 'error';
  error?: string;
  details?: Record<string, unknown>;
};

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

async function refreshZohoAccessTokenViaEnvOrPayload(opts: {
  payloadAccessToken?: string;
  payloadRefreshToken?: string;
}): Promise<string | null> {
  // Prefer server-side env refresh token if present
  const refreshTokenEnv = process.env.ZOHO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID ?? '';
  const clientSecret = process.env.ZOHO_CLIENT_SECRET ?? '';
  const accountUrl = process.env.ACCOUNT_URL; // e.g., https://kf.zohoplatform.com/clientoauth/v2/<clientId>

  const tryRefresh = async (refreshToken: string) => {
    if (!accountUrl) return null;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
    const res = await fetch(`${accountUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = (await res.json()) as any;
    if (!res.ok || !data?.access_token) {
      logger.error('Zoho token refresh failed', { status: res.status, data });
      return null;
    }
    return data.access_token as string;
  };

  if (refreshTokenEnv) {
    const t = await tryRefresh(refreshTokenEnv);
    if (t) return t;
  }

  if (opts.payloadRefreshToken) {
    const t = await tryRefresh(opts.payloadRefreshToken);
    if (t) return t;
  }

  if (opts.payloadAccessToken) return opts.payloadAccessToken;
  return null;
}

export const applyInvoices = task({
  id: 'apply-invoices',
  run: async (payload: {
    jobId: string;
    token?: { accessToken?: string; refreshToken?: string };
  }) => {
    const jobId = payload.jobId;
    logger.log('Starting apply-invoices', { jobId });

    // Mark RUNNING
    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        logs: { push: ['Job started'] },
      },
    });

    try {
      const parameters: any = job.parameters as any;
      const removeMode: 'delete' | 'void' = parameters?.mode ?? 'delete';
      const base64 = parameters?.file?.base64 as string | undefined;
      if (!base64) throw new Error('Missing uploaded file in job parameters');

      const buf = Buffer.from(base64, 'base64');
      const ab = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      );

      const { headers, groups, invoices, ym } =
        parseInvoicesWorkbookArrayBuffer(ab, SHEET_NAME);

      const links = await prisma.invoiceLink.findMany({ where: { ym } });
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
          Invoice_Date: g.invoiceDate,
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

      const totalItems = toCreate.length + toUpdate.length + toRemove.length;
      let processedItems = 0;

      const updateProgress = async (note?: string) => {
        const progress =
          totalItems === 0
            ? 100
            : Math.min(100, Math.round((processedItems / totalItems) * 100));
        await prisma.job.update({
          where: { id: jobId },
          data: {
            progress,
            processedItems,
            totalItems,
            logs: note ? { push: [note] } : undefined,
          },
        });
      };

      const token = await refreshZohoAccessTokenViaEnvOrPayload({
        payloadAccessToken: payload.token?.accessToken,
        payloadRefreshToken: payload.token?.refreshToken,
      });
      if (!token)
        throw new Error(
          'Failed to get Zoho access token (no env ZOHO_REFRESH_TOKEN and no payload token/refreshToken)',
        );

      await asyncPool(CONCURRENCY, toCreate, async (g) => {
        try {
          const record = payloadForGroup(g);
          const crmId = await insertInvoice(token, record);
          await prisma.invoiceLink.upsert({
            where: { externalKey: g.externalKey },
            create: {
              ym: g.ym,
              externalKey: g.externalKey,
              crmId,
              contentHash: g.contentHash,
            },
            update: { crmId, contentHash: g.contentHash, ym: g.ym },
          });
          created.push({
            externalKey: g.externalKey,
            crmId,
            status: 'created',
          });
        } catch (e: unknown) {
          const { message, details } = parseAxiosError(e);
          errors.push({
            externalKey: g.externalKey,
            status: 'skipped',
            error: message,
            details,
          });
        } finally {
          processedItems += 1;
          await updateProgress();
        }
      });

      await asyncPool(CONCURRENCY, toUpdate, async (g) => {
        const link = linkMap.get(g.externalKey);
        if (!link) {
          errors.push({
            externalKey: g.externalKey,
            status: 'skipped',
            error: `Invoice link not found: ${g.externalKey}`,
          });
          processedItems += 1;
          await updateProgress();
          return;
        }
        try {
          const record = payloadForGroup(g);
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
        } finally {
          processedItems += 1;
          await updateProgress();
        }
      });

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
        } finally {
          processedItems += 1;
          await updateProgress();
        }
      });

      let errorReport: {
        fileName: string;
        mime: string;
        base64: string;
      } | null = null;
      if (errors.length > 0) {
        const errorRows: ErrorRow[] = errors.flatMap((er) =>
          deriveErrorRows(er, groupByKey.get(er.externalKey)),
        );
        errorReport = generateErrorReport(headers, groups, errorRows);
      }

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          progress: 100,
          result: {
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
          },
          logs: { push: ['Job completed'] },
        },
      });
      logger.log('apply-invoices completed', { jobId });
    } catch (e: any) {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: e?.message ?? String(e),
          logs: { push: ['Job failed', e?.message ?? String(e)] },
        },
      });
      logger.error('apply-invoices failed', {
        jobId,
        error: e?.message ?? String(e),
      });
      throw e;
    }
  },
});
