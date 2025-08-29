import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.ZOHO_CLIENT_ID!;
  const redirectUri = encodeURIComponent(process.env.ZOHO_REDIRECT_URI!);
  const scope = encodeURIComponent(
    'ZohoCRM.settings.ALL,ZohoCRM.modules.ALL,ZohoCRM.users.READ,ZohoCRM.coql.READ,ZohoCRM.bulk.read,ZohoCRM.org.ALL,ZohoCRM.mass_delete.DELETE,ZohoCRM.settings.ALL',
  );

  const authUrl = `${process.env.ACCOUNT_URL}/auth?scope=${scope}&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${redirectUri}&prompt=consent`;

  return NextResponse.redirect(authUrl);
}
