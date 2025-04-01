import { cookies } from "next/headers";

export async function getAccessToken() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("vcrm_access_token")?.value;
  return accessToken ?? null;
}
