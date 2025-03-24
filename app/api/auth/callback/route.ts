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
  });

  const tokenRes = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.refresh_token) {
    return new NextResponse("Error fetching token", { status: 500 });
  }

   (await cookies()).set("vcrm_refresh_token", tokenData.refresh_token, {
    httpOnly: true,
    path: "/",
    secure: true,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.redirect("/");
}
