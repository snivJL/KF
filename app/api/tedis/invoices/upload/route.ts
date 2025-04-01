import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/vcrm";
import axios from "axios";
import { format } from "date-fns";
import type {
  EnrichedValidatedInvoice,
  ValidatedInvoice,
} from "@/types/tedis/invoices";
import { prisma } from "@/lib/prisma";
import { parseAxiosError } from "@/lib/errors";

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

    const enriched: EnrichedValidatedInvoice[] = invoices.map((row) => ({
      ...row,
      itemId: ++currentInvoiceItemId,
    }));

    // Group by consecutive subjects only
    const grouped: EnrichedValidatedInvoice[][] = [];
    let currentGroup: EnrichedValidatedInvoice[] = [];

    enriched.forEach((current, i) => {
      const previous = enriched[i - 1];

      if (!previous || current.subject === previous.subject) {
        currentGroup.push(current);
      } else {
        grouped.push(currentGroup);
        currentGroup = [current];
      }
    });

    if (currentGroup.length > 0) {
      grouped.push(currentGroup);
    }

    const results: { subject: string; success: boolean; error?: string }[] = [];

    for (const group of grouped) {
      if (!group.length) continue;

      const first = group[0]!;
      const formattedDate = format(new Date(first.invoiceDate), "ddMMyy");
      const subject = `${formattedDate} ${first.subject} ${first.itemId}`;

      const payload = {
        Subject: subject,
        Invoice_Date: format(new Date(first.invoiceDate), "yyyy-MM-dd"),
        Billing_Street: first.shippingStreet,
        Billing_City: first.shippingCity,
        Billing_Code: first.shippingCode,
        Billing_Country: first.shippingCountry,
        Billing_State: first.shippingProvince,
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
      } catch (err) {
        const { message } = parseAxiosError(err);
        console.error(`Failed to upload invoice ${subject}:`, message);
        results.push({ subject, success: false, error: message });
      }
    }

    // Update invoice item counter in DB
    await prisma.invoiceItemCounter.upsert({
      where: { id: 1 },
      update: { lastId: currentInvoiceItemId.toString() },
      create: { id: 1, lastId: currentInvoiceItemId.toString() },
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: successCount,
      failed: failCount,
      results,
    });
  } catch (err) {
    console.error("❌ Unexpected upload error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
