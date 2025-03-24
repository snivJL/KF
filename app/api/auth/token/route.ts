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

  const tokenUrl = process.env.ACCOUNT_URL!;

  const res = await fetch(tokenUrl + "/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    console.error("Access token refresh failed", data);
    return new NextResponse("Token refresh failed", { status: 500 });
  }

  return new NextResponse(data.access_token);
}
