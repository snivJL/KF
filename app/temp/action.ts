"use server";

import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

import {
  getInvoiceDetails,
  updateInvoiceItem,
} from "@/lib/zoho/invoices/related-items";

type InvoiceUpdateResult = {
  id: string;
  status: "updated" | "failed";
  error?: string;
};

export async function startInvoiceEmployeeSync(formData: FormData): Promise<{
  results: InvoiceUpdateResult[];
}> {
  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file uploaded.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  const json = XLSX.utils.sheet_to_json<{ Id: string; "Owner.id": string }>(
    sheet!
  );

  let token = await getValidAccessTokenFromServer();

  if (!token) {
    throw new Error("Failed to retrieve access token");
  }

  const results: InvoiceUpdateResult[] = [];

  for (const invoice of json) {
    try {
      token = (await getValidAccessTokenFromServer()) ?? token;

      const employee = await prisma.employee.findUnique({
        where: { userId: invoice["Owner.id"] },
      });
      if (!employee) {
        console.log(`⚠️ No employee found for user ${invoice["Owner.id"]}`);
        continue;
      }

      const [invoiceDetail] = await getInvoiceDetails(invoice.Id, token);
      const invoiceItems = [...invoiceDetail.Invoiced_Items];

      const alreadyAssigned = invoiceItems.every(
        (item) => item.Assigned_Employee
      );
      if (alreadyAssigned) {
        console.log(
          `✅ Invoice ${invoice.Id} already has all items assigned to an employee`
        );
        continue;
      }

      await updateInvoiceItem(
        employee.id,
        invoice["Owner.id"],
        invoice.Id,
        invoiceItems,
        token
      );

      results.push({ id: invoice.Id, status: "updated" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`❌ Failed invoice ${invoice.Id}: ${msg}`);
      results.push({ id: invoice.Id, status: "failed", error: msg });
    }
  }

  return { results };
}
