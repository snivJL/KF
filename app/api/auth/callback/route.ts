import { NextRequest, NextResponse } from "next/server";

/**
 * 🌐 OAuth Callback Handler
 *
 * - Exchanges code for access_token and refresh_token
 * - Saves tokens and expiration timestamp to cookies
 * - Handles both Development and Production environments
 */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  const tokenUrl = `${process.env.ACCOUNT_URL!}/token`;
  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    redirect_uri: process.env.ZOHO_REDIRECT_URI!,
    code,
  });

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  const tokenData = await tokenRes.json();
  console.log("Zoho Token Response:", tokenData);

  if (!tokenRes.ok || !tokenData.access_token || !tokenData.refresh_token) {
    console.error("Token fetch failed", tokenData);
    return new Response("Error fetching token", { status: 500 });
  }

  const { refresh_token } = tokenData;

  //get refresh token
  const params = new URLSearchParams({
    refresh_token,
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
  console.log("REFRESH TOKEN", data);

  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    const response = NextResponse.redirect(`${req.nextUrl.origin}/`);

    // Save access token (optional httpOnly) — typically you want it client-accessible if needed
    response.cookies.set("vcrm_access_token", data.access_token, {
      path: "/",
      secure: true,
      sameSite: "lax",
      httpOnly: false, // Client needs to send it via headers
    });

    return response;
  } else {
    // In development, use JS to manually set cookies (simpler local testing)
    const html = `
      <html>
        <body>
          <script>
            document.cookie = "vcrm_access_token=${data.access_token}; path=/; samesite=lax";
            window.location.href = "/";
          </script>
        </body>
      </html>
    `;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
}
