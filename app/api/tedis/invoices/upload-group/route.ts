// /api/tedis/invoices/upload-group/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";
import { parseAxiosError } from "@/lib/errors";
import axios from "axios";
import { format } from "date-fns";
import type { EnrichedValidatedInvoice } from "@/types/tedis/invoices";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.BASE_URL || "https://kf.zohoplatform.com";
export async function POST(req: NextRequest) {
  try {
    const {
      group,
      currentItemId,
    }: { group: EnrichedValidatedInvoice[]; currentItemId: number } =
      await req.json();
    const accessToken = await getAccessToken();

    const first = group[0]!;
    const subject = `${format(new Date(first.invoiceDate), "ddMMyy")} ${
      first.subject
    } ${currentItemId}`;

    const payload = {
      Subject: subject,
      Invoice_Date: format(new Date(first.invoiceDate), "yyyy-MM-dd"),
      Account_Name: { id: first.accountId },
      Invoiced_Items: group.map((item) => ({
        Product_Name: { id: item.productId },
        Assigned_Employee: { id: item.employeeId },
        Quantity: item.quantity,
        Discount: item.discount,
        List_Price: item.listPrice,
      })),
    };

    await axios.post(
      `${BASE_URL}/crm/v6/Invoices`,
      { data: [payload] },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    await prisma.invoiceItemCounter.upsert({
      where: { id: 1 },
      update: { lastId: currentItemId.toString() },
      create: { id: 1, lastId: currentItemId.toString() },
    });
    return NextResponse.json({ subject, success: true });
  } catch (err) {
    const { message } = parseAxiosError(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
