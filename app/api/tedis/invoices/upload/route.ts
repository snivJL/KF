import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/vcrm";
import axios from "axios";
import { format } from "date-fns";
import type {
  EnrichedValidatedInvoice,
  ValidatedInvoice,
} from "@/types/tedis/invoices";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.BASE_URL || "https://kf.zohoplatform.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const invoices = body.validatedInvoices as ValidatedInvoice[];
    if (!Array.isArray(invoices)) {
      return NextResponse.json(
        { error: "Missing validated invoices." },
        { status: 400 }
      );
    }

    const accessToken = await getAccessToken();
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const lastInvoiceItemId = await prisma.invoiceItemCounter.findFirst();
    let currentInvoiceItemId = parseInt(lastInvoiceItemId?.lastId || "1", 10);

    const enriched = invoices.map((row) => {
      return { ...row, itemId: ++currentInvoiceItemId };
    }) as EnrichedValidatedInvoice[];

    const grouped = enriched.reduce(
      (acc: Record<string, EnrichedValidatedInvoice[]>, invoice) => {
        const subject = invoice.subject;
        if (!subject) {
          throw new Error("Invoice is missing subject.");
        }

        (acc[subject] ??= []).push(invoice);

        return acc;
      },
      {}
    );
    const results: { subject: string; success: boolean; error?: string }[] = [];
    for (const [invoiceNo, group] of Object.entries(grouped)) {
      if (!group || group.length === 0) continue;

      const first = group[0]!;
      const formattedDate = format(new Date(first.invoiceDate), "ddMMyy");

      const subject = `${formattedDate} ${invoiceNo} ${group[0]?.itemId}`;
      console.log(group);

      const payload = {
        Subject: subject,
        Invoice_Date: format(new Date(first.invoiceDate), "yyyy-MM-dd"),
        Account_Name: { id: first.accountId },
        Invoiced_Items: group.map((item) => ({
          Product_Name: { id: item.productId },
          Product_Code: item.productCode,
          Assigned_Employee: { id: item.employeeId },
          Quantity: item.quantity,
          Discount: item.discount,
          List_Price: item.listPrice,
        })),
      };

      try {
        await axios.post(
          `${BASE_URL}/crm/v6/Invoices`,
          { data: [payload] },
          { headers }
        );

        results.push({ subject, success: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (axios.isAxiosError(err)) {
          console.error("Zoho API Error:");
          console.error("Status:", err.response?.status);
          console.error("Data:", err.response?.data);
          console.error("URL:", err.config?.url);
          console.error("Headers:", err.config?.headers);
          console.error("Error Details", err.response?.data?.data[0]?.details);
        }

        const message =
          err.response?.data?.message || err.message || "Unknown error";
        console.error(`Failed to upload invoice ${subject}:`, message);
        results.push({ subject, success: false, error: message });
      }
    }

    const newLastId = currentInvoiceItemId.toString();
    await prisma.invoiceItemCounter.upsert({
      where: { id: 1 },
      update: { lastId: newLastId },
      create: { id: 1, lastId: newLastId },
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: successCount,
      failed: failCount,
      results,
    });
  } catch (err) {
    console.error("Unexpected upload error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
