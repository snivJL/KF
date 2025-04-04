import { NextRequest, NextResponse } from "next/server";

/**
 * 🔄 API Route: Refresh Access Token
 *
 * - Uses stored HttpOnly refresh_token cookie
 * - Gets new access_token and updates expiration
 * - Clears cookies on refresh failure
 */

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get("vcrm_refresh_token")?.value;

  if (!refreshToken) {
    console.error("Missing refresh token cookie");
    return new Response("Missing refresh token", { status: 401 });
  }

  const tokenUrl = `${process.env.ACCOUNT_URL!}/token`;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: refreshToken,
  });

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const tokenData = await tokenRes.json();
  console.log("Zoho Refresh Token Response:", tokenData);

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("Failed to refresh access token", tokenData);

    // Clear all auth cookies if refresh fails
    const response = NextResponse.json(
      { error: "Invalid refresh token" },
      { status: 401 }
    );
    response.cookies.set("vcrm_access_token", "", { path: "/", maxAge: 0 });
    response.cookies.set("vcrm_access_token_expires", "", {
      path: "/",
      maxAge: 0,
    });
    response.cookies.set("vcrm_refresh_token", "", { path: "/", maxAge: 0 });
    return response;
  }

  const { access_token, expires_in } = tokenData;
  const expirationTimestamp = Date.now() + expires_in * 1000;

  const response = NextResponse.json({ access_token });

  // Update access_token and expiration timestamp
  response.cookies.set("vcrm_access_token", access_token, {
    path: "/",
    secure: true,
    sameSite: "lax",
    httpOnly: false, // Client needs to read and send it
    maxAge: expires_in,
  });

  response.cookies.set(
    "vcrm_access_token_expires",
    expirationTimestamp.toString(),
    {
      path: "/",
      secure: true,
      sameSite: "lax",
      httpOnly: false,
      maxAge: expires_in,
    }
  );

  return response;
}
