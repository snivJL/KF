import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getValidAccessTokenFromServer } from "@/lib/auth-server";

const BASE_URL = process.env.BASE_URL!; // e.g. "https://kf.zohoplatform.com"

interface ApiResponse {
  id: string;
  success: boolean;
  message?: string;
  zohoResponse?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const repCode = formData.get("repCode");
    const contactCode = formData.get("contactCode");
    console.log("Posting form data:", repCode, contactCode);
    if (
      typeof repCode !== "string" ||
      !repCode.trim() ||
      typeof contactCode !== "string" ||
      !contactCode.trim()
    ) {
      return NextResponse.json(
        { success: false, message: "Missing or invalid repCode/contactCode" },
        { status: 400 }
      );
    }

    const rep = repCode.trim();
    const acc = contactCode.trim();

    // Lookup employee
    const employee = await prisma.employee.findUnique({
      where: { code: rep },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json(
        {
          id: rep,
          success: false,
          message: `Employee code "${rep}" not found`,
        },
        { status: 404 }
      );
    }

    // Lookup contact
    const contact = await prisma.contact.findUnique({
      where: { code: acc },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json(
        { id: rep, success: false, message: `Contact code "${acc}" not found` },
        { status: 404 }
      );
    }
    console.log("found employee:", employee);
    console.log("found contact:", contact);
    // Build payload for Zoho custom module
    const payload = {
      data: [
        {
          Contact_s_Assigned_to_Employee: contact.id,
          Employee_s_Assigned_to_Contact: employee.id,
        },
      ],
    };

    // Send to Zoho
    const accessToken = await getValidAccessTokenFromServer();
    try {
      const zohoRes = await axios.post<{ data: unknown[] }>(
        `${BASE_URL}/crm/v6/Contacts_Employees`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      return NextResponse.json<ApiResponse>({
        id: rep,
        success: true,
        zohoResponse: zohoRes.data,
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data ?? err.message;
        return NextResponse.json<ApiResponse>(
          { id: rep, success: false, message: JSON.stringify(detail) },
          { status: err.response?.status || 500 }
        );
      }
      throw err;
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    console.error("Contacts_Employees API error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
