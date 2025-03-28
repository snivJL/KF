import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/vcrm";
import axios from "axios";
import { format } from "date-fns";

const BASE_URL = process.env.BASE_URL || "https://kf.zohoplatform.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const invoices = body.validatedInvoices;
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

    const grouped = invoices.reduce(
      (acc: Record<string, typeof invoices>, invoice) => {
        if (!acc[invoice.subject]) acc[invoice.subject] = [];
        acc[invoice.subject].push(invoice);
        return acc;
      },
      {}
    );
    console.log(grouped);
    const results: { subject: string; success: boolean; error?: string }[] = [];
    for (const invoice of invoices) {
      try {
        const invoiceGroup = grouped[invoice.subject];
        const header = invoiceGroup[0];

        const formattedDate = format(
          new Date(header.invoiceDate),
          "yyyy-MM-dd"
        );

        const payload = {
          Subject: invoice.subject,
          Invoice_Date: formattedDate,
          Account_Name: { id: header.accountId },
          Invoiced_Items: invoiceGroup.map((item) => ({
            Product_Name: { id: item.productId },
            Assigned_Employee: { id: item.employeeId },
            Quantity: item.quantity,
            Total_Discount_on_item: item.discount,
            List_Price: item.listPrice,
          })),
        };

        console.log(payload);
        await axios.post(
          `${BASE_URL}/crm/v6/Invoices`,
          { data: [payload] },
          { headers }
        );

        results.push({ subject: invoice.subject, success: true });
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
        console.error(`Failed to upload invoice ${invoice.subject}:`, message);
        results.push({
          subject: invoice.subject,
          success: false,
          error: message,
        });
      }
    }

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
