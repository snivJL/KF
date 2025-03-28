import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/vcrm";
import axios from "axios";
import { prisma } from "@/lib/prisma";

const BASE_URL = "https://kf.zohoplatform.com";

export async function POST() {
  try {
    const accessToken = await getAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}` };

    const response = await axios.get(`${BASE_URL}/crm/v6/Products?fields=id,Product_Code,Product_Name`, { headers });
    const products = response.data?.data || [];

    for (const p of products) {
      await prisma.product.upsert({
        where: { id: p.id },
        update: {
          productCode: p.Product_Code,
          name: p.Product_Name,
        },
        create: {
          id: p.id,
          productCode: p.Product_Code,
          name: p.Product_Name,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ synced: products.length });
  } catch (err) {
    console.error("Sync failed:", err);
    return NextResponse.json({ error: "Failed to sync products." }, { status: 500 });
  }
}
