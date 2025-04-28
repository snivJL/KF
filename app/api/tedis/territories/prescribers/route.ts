// app/api/territories/customers/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getAccessTokenFromServer } from "@/lib/auth-server";

const BASE_URL = process.env.BASE_URL!; // e.g. "https://kf.zohoplatform.com"

interface ContactsResult {
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
    const contact = await prisma.contact.findUnique({
      where: { code },
      select: { id: true, trigger: true },
    });
    if (!contact) {
      return NextResponse.json(
        { success: false, message: `Contact code "${code}" not found` },
        { status: 404 }
      );
    }

    // 2) get Zoho token
    const accessToken = await getAccessTokenFromServer();

    // 3) update Zoho CRM
    const payload = {
      data: [
        {
          id: contact.id,
          Workflow__Trigger__C: !contact.trigger,
        },
      ],
    };

    try {
      const zohoRes = await axios.put<{ data: unknown[] }>(
        `${BASE_URL}/crm/v6/Contacts/${contact.id}`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      return NextResponse.json<ContactsResult>({
        success: true,
        zohoResponse: zohoRes.data,
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail =
          (err.response?.data as Record<string, unknown>) ?? err.message;
        return NextResponse.json<ContactsResult>(
          { success: false, message: JSON.stringify(detail) },
          { status: err.response?.status || 500 }
        );
      }
      throw err;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    console.error("Contact trigger error:", msg);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
