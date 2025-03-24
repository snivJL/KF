import { NextResponse } from "next/server";
import { getSession } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSession());
}
