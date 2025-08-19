function getCookie(name: string): string | null | undefined {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

export async function getAccessToken(): Promise<string | null | undefined> {
  return getCookie("vcrm_access_token");
}

export async function fetchWithAuth(input: RequestInfo, init?: RequestInit) {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    console.error("No valid Zoho access token");

    throw new Error("No valid Zoho access token");
  }

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    ...init?.headers,
  };

  return fetch(input, {
    ...init,
    headers: authHeaders,
  });
}

export function assertN8NApiKey(headers: Headers) {
  const provided = headers.get("x-api-key");
  const expected = process.env.N8N_API_KEY;
  if (!expected || provided !== expected) {
    throw new Response("Unauthorized", { status: 401 });
  }
}
