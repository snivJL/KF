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

  const { access_token, refresh_token, expires_in } = tokenData;
  const expirationTimestamp = Date.now() + expires_in * 1000; // expires_in is in seconds

  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    const response = NextResponse.redirect(`${req.nextUrl.origin}/`);

    // Save access token (optional httpOnly) — typically you want it client-accessible if needed
    response.cookies.set("vcrm_access_token", access_token, {
      path: "/",
      secure: true,
      sameSite: "lax",
      maxAge: expires_in,
      httpOnly: false, // Client needs to send it via headers
    });

    // Save access token expiration
    response.cookies.set(
      "vcrm_access_token_expires",
      expirationTimestamp.toString(),
      {
        path: "/",
        secure: true,
        sameSite: "lax",
        maxAge: expires_in,
        httpOnly: false,
      }
    );

    // Save refresh token (secure and httpOnly!)
    response.cookies.set("vcrm_refresh_token", refresh_token, {
      path: "/",
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } else {
    // In development, use JS to manually set cookies (simpler local testing)
    const html = `
      <html>
        <body>
          <script>
            document.cookie = "vcrm_access_token=${access_token}; path=/; max-age=${expires_in}; samesite=lax";
            document.cookie = "vcrm_access_token_expires=${expirationTimestamp}; path=/; max-age=${expires_in}; samesite=lax";
            document.cookie = "vcrm_refresh_token=${refresh_token}; path=/; max-age=${
      60 * 60 * 24 * 30
    }; samesite=lax";
            window.location.href = "/";
          </script>
        </body>
      </html>
    `;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
}
