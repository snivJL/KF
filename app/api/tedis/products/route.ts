import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(products);
  } catch (err) {
    console.error("Failed to fetch products:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
