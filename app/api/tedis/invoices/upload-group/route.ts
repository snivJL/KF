// app/api/tedis/invoices/upload-group/route.ts
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import { parseAxiosError } from "@/lib/errors";
import { assertN8NApiKey } from "@/lib/auth";
import type { EnrichedValidatedInvoice } from "@/types/tedis/invoices";

const BASE_URL = process.env.BASE_URL || "https://kf.zohoplatform.com";

function buildUniqueId(
  invoiceDate: string | Date,
  subject: string,
  currentItemId: number
) {
  const d =
    typeof invoiceDate === "string" ? new Date(invoiceDate) : invoiceDate;
  return `${format(d, "ddMMyy")} ${subject} ${currentItemId}`;
}

export async function POST(req: NextRequest) {
  try {
    // n8n M2M auth (API key header)
    assertN8NApiKey(req.headers);

    const body = await req.json();
    const group: EnrichedValidatedInvoice[] = body?.group ?? [];
    if (!Array.isArray(group) || group.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing group" },
        { status: 400 }
      );
    }

    // Atomically: read current lastId, increment, and get the NEW value
    const { uniqueId, currentItemId, first } = await prisma.$transaction(
      async (tx) => {
        // Ensure row exists; IMPORTANT: we do NOT reset the current value
        const exists = await tx.invoiceItemCounter.findUnique({
          where: { id: 1 },
          select: { id: true },
        });
        if (!exists) {
          // If you prefer silent bootstrap, replace this with an upsert that sets lastId to your known current value.
          throw new Error("InvoiceItemCounter row (id=1) is missing.");
        }

        const rows = await tx.$queryRaw<Array<{ next: bigint }>>`
        UPDATE "InvoiceItemCounter"
        SET "lastId" = (COALESCE(NULLIF("lastId", ''), '0')::bigint + 1)::text
        WHERE "id" = 1
        RETURNING "lastId"::bigint AS next;
      `;

        if (!rows?.length)
          throw new Error("Failed to increment invoice counter.");

        const currentItemId = Number(rows[0]!.next);
        const first = group[0]!;
        const subjectBase = String(first.subject || "").trim();
        const uniqueId = buildUniqueId(
          first.invoiceDate,
          subjectBase,
          currentItemId
        );

        return { uniqueId, currentItemId, first };
      }
    );

    const payload = {
      Subject: uniqueId,
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

    const accessToken = await getValidAccessTokenFromServer();

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

    return NextResponse.json({
      success: true,
      subject: uniqueId,
      currentItemId, // the incremented value actually used
    });
  } catch (err) {
    const { message } = parseAxiosError(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    );
  }
}
