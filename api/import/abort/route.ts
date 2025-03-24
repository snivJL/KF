import { NextResponse } from "next/server";
import { abortImport } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function DELETE() {
  abortImport();
  return NextResponse.json({ status: "aborted" });
}
