import { cookies } from "next/headers";

export async function getAccessTokenFromServer(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("vcrm_access_token")?.value;
  const expiresAt = cookieStore.get("vcrm_access_token_expires")?.value;

  if (!accessToken || !expiresAt) {
    return null;
  }

  const now = Date.now();
  if (now < parseInt(expiresAt, 10)) {
    return accessToken;
  }

  // If expired, refresh manually
  const refreshToken = cookieStore.get("vcrm_refresh_token")?.value;
  if (!refreshToken) {
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
    console.error("Failed to refresh server access token", tokenData);
    return null;
  }

  // Warning: at server level, you can't update cookies mid-request easily.
  // You'll have to do it manually in the response when you need it.
  return tokenData.access_token;
}
