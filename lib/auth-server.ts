import { cookies } from "next/headers";

export async function getAccessTokenFromServer(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("vcrm_access_token")?.value;
  if (!accessToken) {
    console.warn("No access token found in cookies");
    return null;
  }
  // Warning: at server level, you can't update cookies mid-request easily.
  // You'll have to do it manually in the response when you need it.
  return accessToken;
}
