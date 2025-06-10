import { cookies } from "next/headers";

/**
 * Refresh the access token using the stored refresh token.
 * Also updates the cookies with the new values.
 */
export async function refreshAccessTokenServer(): Promise<string | null> {
  const cookieStore = await cookies();
  console.log(cookieStore.get("vcrm_refresh_token"));
  const refreshToken = cookieStore.get("vcrm_refresh_token")?.value;

  if (!refreshToken) {
    console.error("Missing refresh token cookie");
    return null;
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
  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("Failed to refresh access token", tokenData);
    return null;
  }

  const { access_token, expires_in, expires_in_sec } = tokenData;
  const expirationTimestamp = Date.now() + expires_in;
  console.log(
    "New access token received, expires in:",
    expires_in_sec,
    "seconds",
    tokenData
  );
  cookieStore.set("vcrm_access_token", access_token, {
    path: "/",
    secure: true,
    sameSite: "lax",
    httpOnly: false,
    maxAge: expires_in,
  });

  cookieStore.set("vcrm_access_token_expires", expirationTimestamp.toString(), {
    path: "/",
    secure: true,
    sameSite: "lax",
    httpOnly: false,
    maxAge: expires_in,
  });

  return access_token as string;
}

/**
 * Get a valid access token, refreshing it if it has expired.
 */
export async function getValidAccessTokenFromServer(): Promise<string | null> {
  const cookieStore = await cookies();
  const expires = cookieStore.get("vcrm_access_token_expires")?.value;
  const token = cookieStore.get("vcrm_access_token")?.value;
  const expiresInMs = parseInt(expires!, 10) - Date.now();
  const expiresInSec = Math.floor(expiresInMs / 1000);
  console.log(`Token will expire in ${expiresInSec} seconds`);

  if (token && expires && Date.now() < parseInt(expires!, 10) - 60_000) {
    return token;
  }
  console.log("Token expired, refreshing...");
  return await refreshAccessTokenServer();
}
