export async function getAccessToken() {
    const clientId = process.env.VCRM_CLIENT_ID!;
    const clientSecret = process.env.VCRM_CLIENT_SECRET!;
    const refreshToken = process.env.VCRM_REFRESH_TOKEN!;
    const authUrl = "https://accounts.zoho.com/oauth/v2/token";
  
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    });
  
    const res = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  
    if (!res.ok) throw new Error("Failed to fetch access token");
  
    const data = await res.json();
    return data.access_token;
  }
  