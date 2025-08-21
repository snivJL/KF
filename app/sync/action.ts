"use server";

import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  asDecimal,
  sha,
  formatZohoAxiosError,
} from "@/lib/zoho/invoices.helpers";
import {
  getInvoiceWithSubform,
  listAllInvoiceIds,
} from "@/lib/zoho/invoices.list";
import {
  type SyncInvoicesInput,
  SyncInvoicesSchema,
} from "@/lib/zoho/invoices.types";

export async function syncInvoicesFromZoho(input: SyncInvoicesInput) {
  const parsed = SyncInvoicesSchema.parse(input);
  const token = await getValidAccessTokenFromServer();
  if (!token) throw new Error("Failed to retrieve access token");

  try {
    // 1) Enumerate all IDs (handles DISCRETE_PAGINATION_LIMIT_EXCEEDED via page_token)
    const ids = await listAllInvoiceIds(token, 2000, parsed.maxInvoices);

    // 2) Pull each invoice (v6) with subform included
    let synced = 0;
    for (const id of ids) {
      const inv = await getInvoiceWithSubform(token, id);
      if (!inv) continue;

      const canonicalInvoice = {
        zohoId: inv.id,
        subject: inv.Subject ?? null,
        date: inv.Invoice_Date ? new Date(inv.Invoice_Date) : null,
        accountId: inv.Account_Name?.id ?? null,
        subtotal: asDecimal(inv.Sub_Total),
        discount: asDecimal(inv.Discount),
        tax: asDecimal(inv.Tax),
        grandTotal: asDecimal(inv.Grand_Total),
        currency: inv.Currency ?? null,
        status: inv.Status ?? null,
      } as const;
      const invoiceHash = sha(canonicalInvoice);

      // Upsert refs first (account, products, employees)
      const items = (inv.Invoiced_Items ?? []) as any[];

      await prisma.$transaction(async (tx) => {
        const dbInv = await tx.invoice.upsert({
          where: { zohoId: inv.id },
          create: { ...canonicalInvoice, contentHash: invoiceHash },
          update: { ...canonicalInvoice, contentHash: invoiceHash },
        });

        for (let idx = 0; idx < items.length; idx++) {
          const row = items[idx];
          const zohoRowId = row.id || sha({ inv: inv.id, idx, row });
          const canonicalItem = {
            zohoRowId,
            invoiceId: dbInv.id,
            productId: row.Product_Name?.id ?? null,
            productName: row.Product_Name?.name ?? null,
            quantity: asDecimal(row.Quantity),
            listPrice: asDecimal(row.List_Price),
            discount: asDecimal(row.Discount),
            tax: asDecimal(row.Tax),
            amount: asDecimal(row.Total_After_Discount),
            total: asDecimal(row.Total),
            employeeZohoId: row.Assigned_Employee?.id ?? null,
          } as const;
          const itemHash = sha(canonicalItem);

          await tx.invoiceItem.upsert({
            where: { zohoRowId },
            create: { ...canonicalItem, contentHash: itemHash },
            update: { ...canonicalItem, contentHash: itemHash },
          });
        }
      });

      synced++;
    }

    return {
      success: true,
      mode: parsed.mode,
      syncedInvoices: synced,
    } as const;
  } catch (err) {
    const e = formatZohoAxiosError(err);
    throw new Error(`Sync failed: ${e.message}`);
  }
}
