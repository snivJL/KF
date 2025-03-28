import { NextRequest, NextResponse } from "next/server";

/**
 * 🌐 Environment-Aware OAuth Callback
 *
 * On development:
 * - Uses client-side JavaScript (document.cookie) to store refresh_token for simplicity.
 *
 * On production:
 * - Stores refresh_token securely in HttpOnly cookies using `NextResponse.cookies.set`.
 */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  const tokenUrl = `${process.env.ACCOUNT_URL!}/token`;
  const tempTokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    redirect_uri: process.env.ZOHO_REDIRECT_URI!,
    code,
  });

  const tempTokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tempTokenParams.toString(),
  });

  const tempTokenData = await tempTokenRes.json();
  console.log("tempTokenData", tempTokenData);
  if (
    !tempTokenRes.ok ||
    !tempTokenData.access_token ||
    !tempTokenData.refresh_token
  ) {
    console.error("Temp Token fetch failed", tempTokenData);
    return new Response("Error fetching temp token", { status: 500 });
  }
  const tokenParams = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    redirect_uri: process.env.ZOHO_REDIRECT_URI!,
    refresh_token: tempTokenData.refresh_token,
  });
  console.log("INFO:", tokenUrl, tokenParams);
  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("Token exchange failed", tokenData);
    return new Response("Error fetching token", { status: 500 });
  }
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    const response = NextResponse.redirect(`${req.nextUrl.origin}/`);
    response.cookies.set("vcrm_access_token", tokenData.access_token, {
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } else {
    const html = `
      <html>
        <body>
          <script>
            document.cookie = "vcrm_access_token=${tokenData.access_token}; path=/; max-age=2592000; samesite=lax";
            window.location.href = "/";
          </script>
        </body>
      </html>
    `;
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }
}
