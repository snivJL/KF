import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const takeParam = searchParams.get("take");
    const take = takeParam ? parseInt(takeParam, 10) : undefined;

    const contacts = await prisma.contact.findMany({
      orderBy: { updatedAt: "desc" },
      ...(take !== undefined ? { take } : {}), // Only include 'take' if it's defined
    });

    return NextResponse.json(contacts);
  } catch (err) {
    console.error("Failed to fetch contacts:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
