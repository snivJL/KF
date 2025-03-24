import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const refreshToken = (await cookies()).get("vcrm_refresh_token")?.value;

  if (!refreshToken) {
    return new NextResponse("Not authenticated", { status: 401 });
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    return new NextResponse("Token refresh failed", { status: 500 });
  }

  return new NextResponse(data.access_token);
}
