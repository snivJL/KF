import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request:NextRequest) {

  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("vcrm_refresh_token")?.value;

  console.log(
    "TOKEN API received refresh token:",
    request.cookies.get("vcrm_refresh_token"),
    refreshToken
  );

  if (!refreshToken) {
    return new NextResponse("Not authenticated", { status: 401 });
  }

  const tokenUrl = `${process.env.ACCOUNT_URL}/token`;

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    console.error("Access token refresh failed", data);
    return new NextResponse("Token refresh failed", { status: 500 });
  }

  return NextResponse.json({
    access_token: data.access_token,
    expires_in: data.expires_in,
    scope: data.scope,
    token_type: data.token_type,
  });
}
