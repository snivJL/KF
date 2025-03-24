import { NextRequest, NextResponse } from "next/server";
import { read, utils } from "xlsx";
import {
  updateProgress,
  addError,
  setDone,
  resetSession,
  getSession,
} from "@/lib/store";
import { getAccessToken } from "@/lib/vcrm";

export const dynamic = "force-dynamic";

type InvoiceItem = {
  product: string;
  quantity: number;
  unit_price: number;
};

type Invoice = {
  Owner: any;
  Assigned_Users: string[];
  Account_Name: string;
  Subject: string;
  Invoice_Date: string;
  Status: string;
  Billing_Street: string;
  Billing_State: string;
  Billing_City: string;
  Billing_Country: string;
  Invoiced_Items: InvoiceItem[];
};

export async function POST(req: NextRequest) {
  resetSession();

  const formData = await req.formData();
  const file: File | null = formData.get("file") as unknown as File;
  if (!file) return NextResponse.json("No file uploaded", { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, any>[] = utils.sheet_to_json(sheet);

  try {
    const accessToken = await getAccessToken();
    const grouped: Record<string, Invoice> = {};

    // STEP 1: Group rows by Invoice No
    for (const row of rows) {
      const invoiceId = row["Invoice No"];
      if (!invoiceId) {
        addError("Row missing Invoice No");
        continue;
      }

      if (!grouped[invoiceId]) {
        grouped[invoiceId] = {
          Owner: null,
          Assigned_Users: [],
          Account_Name: row["Account ID"] || row["Account Name"] || "", // Adjust mapping as needed
          Subject: `${row["Invoice D. ID"] || invoiceId}`,
          Invoice_Date: new Date(row["Invoice Date"]).toISOString().split("T")[0],
          Status: "Delivered",
          Billing_Street: "",
          Billing_State: "",
          Billing_City: "",
          Billing_Country: "",
          Invoiced_Items: [],
        };
      }

      grouped[invoiceId].Invoiced_Items.push({
        product: row["Product Code"] || row["Product"], // adapt this
        quantity: Number(row["Quantity"] || 1),
        unit_price: Number(row["Price"] || 0),
      });
    }

    const invoiceList = Object.values(grouped);

    for (let i = 0; i < invoiceList.length; i++) {
      updateProgress(Math.round((i / invoiceList.length) * 100));
      const { aborted } = getSession();
      if (aborted) break;

      try {
        const res = await fetch("https://kf.zohoplatform.com/crm/v6/Invoices", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ data: [invoiceList[i]] }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data?.data?.[0]?.message || data?.message || "Unknown error"
          );
        }
      } catch (err: any) {
        addError(`Invoice ${invoiceList[i].Subject}: ${err.message}`);
      }
    }

    setDone();
    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    return NextResponse.json(`Import error: ${err.message}`, { status: 500 });
  }
}
