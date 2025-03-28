import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(employees);
  } catch (err) {
    console.error("Failed to fetch employees:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
