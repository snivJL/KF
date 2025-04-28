// app/api/tedis/prescribers/trigger/route.ts
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getAccessTokenFromServer } from "@/lib/auth-server";

const BASE_URL = process.env.BASE_URL!; // e.g. "https://kf.zohoplatform.com"

type PrescriberResult = {
  code: string;
  success: boolean;
  message?: string;
  zohoResponse?: Record<string, unknown>;
};

export async function POST(request: Request): Promise<NextResponse> {
  const results: PrescriberResult[] = [];

  try {
    // 1) parse multipart form
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "Expected a file under “file”" },
        { status: 400 }
      );
    }

    // 2) load Excel workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await fileEntry.arrayBuffer());
    const sheet = workbook.worksheets[0]!;

    // 3) get Zoho access token
    const accessToken = await getAccessTokenFromServer();

    // 4) iterate codes in Column A (skip header row)
    const column = sheet.getColumn(1).values as (string | number)[];
    for (let idx = 2; idx < column.length; idx++) {
      const raw = column[idx];
      const code = typeof raw === "string" ? raw.trim() : "";
      if (!code) continue;

      try {
        // 5) lookup in Prisma
        const contact = await prisma.contact.findUnique({
          where: { code },
          select: { id: true, trigger: true },
        });
        if (!contact?.id) {
          results.push({ code, success: false, message: "Not found in DB" });
          continue;
        }

        // 6) update Zoho CRM
        const zohoRes = await axios.put<{ data: unknown[] }>(
          `${BASE_URL}/crm/v6/Contacts/${contact.id}`,
          {
            data: [
              {
                id: contact.id,
                Workflow__Trigger__C: !contact.trigger,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        results.push({
          code,
          success: true,
          zohoResponse: zohoRes.data as Record<string, unknown>,
        });
      } catch (e) {
        // Axios-specific error handling
        if (axios.isAxiosError(e)) {
          const errData =
            (e.response?.data as Record<string, unknown>) ?? e.message;
          results.push({
            code,
            success: false,
            message: JSON.stringify(errData),
          });
        } else {
          results.push({
            code,
            success: false,
            message: e instanceof Error ? e.message : "Unknown error",
          });
        }
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    // top-level failure
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Prescriber trigger failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
