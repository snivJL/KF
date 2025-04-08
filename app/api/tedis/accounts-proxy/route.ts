import { NextResponse } from "next/server";

export async function GET() {
  const response = await fetch("https://kf-beta.vercel.app/api/tedis/accounts");
  const data = await response.json();

  const res = NextResponse.json(data);
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}
