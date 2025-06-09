"use server";

import { getAccessTokenFromServer } from "@/lib/auth-server";
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

  const token = await getAccessTokenFromServer();
  if (!token) {
    throw new Error("Failed to retrieve access token");
  }

  const results: InvoiceUpdateResult[] = [];

  for (const invoice of json) {
    try {
      const employee = await prisma.employee.findUnique({
        where: { userId: invoice["Owner.id"] },
      });
      if (!employee) continue;

      const [invoiceDetail] = await getInvoiceDetails(invoice.Id, token);
      const invoiceItems = [...invoiceDetail.Invoiced_Items];

      const alreadyAssigned = invoiceItems.every(
        (item) => item.Assigned_Employee
      );
      if (alreadyAssigned) continue;

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
