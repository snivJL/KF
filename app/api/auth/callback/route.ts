import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const accountsServer = url.searchParams.get("accounts-server");
  const location = url.searchParams.get("location");

  if (!code || !accountsServer || !location) {
    return new NextResponse("Missing code or domain info", { status: 400 });
  }

  const portalId = process.env.ZOHO_PORTAL_ID!;
  const tokenUrl = `${accountsServer}/clientoauth/v2/${portalId}/token`;

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    redirect_uri: process.env.ZOHO_REDIRECT_URI!,
    code,
    state: state || "secure_state"
  });

  const tokenRes = await fetch(tokenUrl, {
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

  (await cookies()).set("vcrm_api_domain", tokenData.api_domain || location, {
    httpOnly: false,
    path: "/",
    secure: true,
    maxAge: 60 * 60 * 24 * 30,
  });

  (await cookies()).set("vcrm_location", location, {
    httpOnly: false,
    path: "/",
    secure: true,
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.redirect("/");
}
