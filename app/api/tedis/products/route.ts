import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const search = url.searchParams.get("search") || "";
    const sortKey =
      (url.searchParams.get(
        "sortKey"
      ) as keyof Prisma.ProductOrderByWithRelationInput) || "updatedAt";
    const sortOrder = (
      url.searchParams.get("sortOrder") === "asc" ? "asc" : "desc"
    ) as Prisma.SortOrder;

    const where = search
      ? {
          OR: [
            {
              productCode: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : undefined;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { [sortKey]: sortOrder },
        skip: offset,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({ products, total });
  } catch (err) {
    console.error("Failed to fetch products:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
