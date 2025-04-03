import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const counter = await prisma.invoiceItemCounter.findFirst();
  return NextResponse.json({ lastId: counter?.lastId || "1" });
}

export async function POST(req: NextRequest) {
  const { lastId } = await req.json();
  await prisma.invoiceItemCounter.upsert({
    where: { id: 1 },
    update: { lastId },
    create: { id: 1, lastId },
  });
  return NextResponse.json({ success: true });
}
