import { NextResponse } from "next/server";
import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import axios from "axios";

const BASE_URL = "https://kf.zohoplatform.com";

export async function POST() {
  try {
    const accessToken = await getValidAccessTokenFromServer();
    const headers = { Authorization: `Bearer ${accessToken}` };

    const response = await axios.get(
      `${BASE_URL}/crm/v6/Employees?fields=id,Code,Name,User_assigned`,
      { headers }
    );
    const employees = response.data?.data || [];

    for (const e of employees) {
      await prisma.employee.upsert({
        where: { id: e.id },
        update: {
          code: e.Code,
          name: e.Name,
          userId: e.User_assigned?.id || null,
          updatedAt: new Date(),
        },
        create: {
          id: e.id,
          code: e.Code,
          name: e.Name,
          userId: e.User_assigned?.id || null,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ synced: employees.length });
  } catch (err) {
    console.error("Sync employees failed:", err);
    return NextResponse.json(
      { error: "Failed to sync employees." },
      { status: 500 }
    );
  }
}
