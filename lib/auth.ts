"use client";

// Utility to get cookie value (works client-side only)
function getCookie(name: string): string | null | undefined {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

// Utility to check if current access token is still valid
export function isAccessTokenValid(): boolean {
  const expiresAt = getCookie("vcrm_access_token_expires");
  if (!expiresAt) return false;

  const now = Date.now();
  return now < parseInt(expiresAt, 10);
}

// Refresh the access token via backend API
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/tedis/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("Failed to refresh access token");
      return null;
    }

    const data = await response.json();
    return data.access_token ?? null;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return null;
  }
}

// Get a valid access token, refreshing it if needed
export async function getAccessToken(): Promise<string | null | undefined> {
  if (isAccessTokenValid()) {
    return getCookie("vcrm_access_token");
  }

  // If expired, try to refresh
  const newAccessToken = await refreshAccessToken();
  if (newAccessToken) {
    return newAccessToken;
  }

  // Refresh failed, return null
  return null;
}

// Helper to fetch protected APIs with automatic token management
export async function fetchWithAuth(input: RequestInfo, init?: RequestInit) {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    // Optional: redirect user if token cannot be refreshed
    console.error("No valid access token, redirecting to login");
    if (typeof window !== "undefined") {
      window.location.href = "/login"; // Or wherever your login page is
    }
    throw new Error("Unauthorized");
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
