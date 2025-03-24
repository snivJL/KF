import { NextResponse } from "next/server";
const PORTAL_ID = "10091425909";

export async function GET() {

  const clientId = process.env.ZOHO_CLIENT_ID!;
  const redirectUri = encodeURIComponent(process.env.ZOHO_REDIRECT_URI!);
  const scope = encodeURIComponent("ZohoCRM.settings.ALL,ZohoCRM.modules.ALL,ZohoCRM.users.ALL,ZohoCRM.org.ALL");

  const authUrl = `https://kf.zohoplatform.com/clientoauth/v2/${PORTAL_ID}/auth?scope=${scope}&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${redirectUri}`

  return NextResponse.redirect(authUrl);
}
