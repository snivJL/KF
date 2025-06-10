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
    const accountCode = formData.get("accountCode");
    console.log("Posting form data:", repCode, accountCode);
    if (
      typeof repCode !== "string" ||
      !repCode.trim() ||
      typeof accountCode !== "string" ||
      !accountCode.trim()
    ) {
      return NextResponse.json(
        { success: false, message: "Missing or invalid repCode/accountCode" },
        { status: 400 }
      );
    }

    const rep = repCode.trim();
    const acc = accountCode.trim();

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

    // Lookup account
    const account = await prisma.account.findUnique({
      where: { code: acc },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json(
        { id: rep, success: false, message: `Account code "${acc}" not found` },
        { status: 404 }
      );
    }
    console.log("found employee:", employee);
    console.log("found account:", account);
    // Build payload for Zoho custom module
    const payload = {
      data: [
        {
          Account_s_Assigned_to_Employee: account.id,
          Employee_s_Assigned_to_Account: employee.id,
        },
      ],
    };

    // Send to Zoho
    const accessToken = await getValidAccessTokenFromServer();
    try {
      const zohoRes = await axios.post<{ data: unknown[] }>(
        `${BASE_URL}/crm/v6/Account_Employee`,
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
    console.error("Accounts_Employees API error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
