// /app/api/auth/callback/route.ts
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) return new NextResponse("Missing code", { status: 400 });

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    redirect_uri: process.env.ZOHO_REDIRECT_URI!,
    code,
    state: "secure_state"
  });

  const tokenUrl = process.env.ACCOUNT_URL!;

  const tokenRes = await fetch(tokenUrl + "/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.refresh_token) {
    console.error("Token exchange failed", tokenData);
    return new NextResponse("Error fetching token", { status: 500 });
  }

  (await cookies()).set("vcrm_refresh_token", tokenData.refresh_token, {
    httpOnly: true,
    path: "/",
    secure: true,
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.redirect("/");
}
