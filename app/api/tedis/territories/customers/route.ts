// app/api/territories/customers/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getAccessTokenFromServer } from "@/lib/auth-server";

const BASE_URL = process.env.BASE_URL!; // e.g. "https://kf.zohoplatform.com"

interface CustomerResult {
  success: boolean;
  message?: string;
  zohoResponse?: Record<string, unknown>;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const form = await request.formData();
    const rawId = form.get("id");
    if (typeof rawId !== "string" || !rawId.trim()) {
      return NextResponse.json(
        { error: 'Missing or invalid "id" field' },
        { status: 400 }
      );
    }
    const code = rawId.trim();

    // 1) lookup in Prisma
    const account = await prisma.account.findUnique({
      where: { code },
      select: { id: true, trigger: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, message: `Account code "${code}" not found` },
        { status: 404 }
      );
    }

    // 2) get Zoho token
    const accessToken = await getAccessTokenFromServer();

    // 3) update Zoho CRM
    const payload = {
      data: [
        {
          id: account.id,
          Workflow__Trigger__C: !account.trigger,
        },
      ],
    };

    try {
      const zohoRes = await axios.put<{ data: unknown[] }>(
        `${BASE_URL}/crm/v6/Accounts/${account.id}`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      return NextResponse.json<CustomerResult>({
        success: true,
        zohoResponse: zohoRes.data,
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail =
          (err.response?.data as Record<string, unknown>) ?? err.message;
        return NextResponse.json<CustomerResult>(
          { success: false, message: JSON.stringify(detail) },
          { status: err.response?.status || 500 }
        );
      }
      throw err;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    console.error("Customer trigger error:", msg);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
