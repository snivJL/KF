import { type NextRequest, NextResponse } from 'next/server';
import axios, { type AxiosResponse } from 'axios';
import { format } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { assertN8NApiKey } from '@/lib/auth';
import { parseAxiosError } from '@/lib/errors';
import type {
  EnrichedValidatedInvoice,
  ZohoInvoicePayload,
} from '@/types/tedis/invoices';
import { getValidAccessTokenFromServer } from '@/lib/auth-server';

const FALLBACK_BASE_URL = process.env.BASE_URL || 'https://kf.zohoplatform.com';
type ZohoActionStatus = 'success' | 'error';

interface ZohoRecordResponse<Details = { id: string }> {
  data: Array<{
    code: string;
    message: string;
    status: ZohoActionStatus;
    details?: Details;
  }>;
}

type ZohoInvoicesCreateBody = { data: ZohoInvoicePayload[] };
type ZohoCreateInvoiceResponse = ZohoRecordResponse<{ id: string }>;

export async function POST(req: NextRequest) {
  try {
    const reqBoy = await req.json();
    const group: EnrichedValidatedInvoice[] = reqBoy?.group ?? [];
    if (!Array.isArray(group) || group.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing group' },
        { status: 400 },
      );
    }

    // Get Zoho token (n8n → Bearer; browser → cookies; or automation fallback)
    const tok = await resolveZohoToken(req);
    const baseUrl = tok.apiDomain || FALLBACK_BASE_URL;

    // Atomic counter increment
    const { uniqueId, currentItemId, first } = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ next: bigint }>>`
        UPDATE "InvoiceItemCounter"
        SET "lastId" = (COALESCE(NULLIF("lastId", ''), '0')::bigint + 1)::text
        WHERE "id" = 1
        RETURNING "lastId"::bigint AS next;
      `;
        if (!rows?.length)
          throw new Error('Failed to increment invoice counter.');

        const currentItemId = Number(rows[0].next);
        const f = group[0];
        const uniqueId = buildUniqueId(
          f.invoiceDate,
          String(f.subject || '').trim(),
          currentItemId,
        );
        return { uniqueId, currentItemId, first: f };
      },
    );

    // Build Zoho payload
    const payload = {
      Subject: uniqueId,
      Invoice_Date: format(new Date(first.invoiceDate), 'yyyy-MM-dd'),
      Billing_Street: first.shippingStreet,
      Billing_City: first.shippingCity,
      Billing_Code: first.shippingCode,
      Billing_Country: first.shippingCountry,
      Billing_State: first.shippingProvince,
      Account_Name: { id: first.accountId },
      Invoiced_Items: group.map((item) => ({
        Product_Name: { id: item.productId },
        Product_Code: item.productCode,
        Assigned_Employee: { id: item.employeeId },
        Quantity: item.quantity,
        Discount: item.discount,
        List_Price: item.listPrice,
      })),
    };
    const body: ZohoInvoicesCreateBody = { data: [payload] };

    let res = await axios.post<
      ZohoCreateInvoiceResponse,
      AxiosResponse<ZohoCreateInvoiceResponse>,
      ZohoInvoicesCreateBody
    >(`${baseUrl}/crm/v6/Invoices`, body, {
      headers: {
        Authorization: `Bearer ${tok.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (looksLikeInvalidToken(res)) {
      // If we control tokens (browser/automation), try one forced refresh; if n8n-provided token, just return the error
      if (tok.source === 'n8n') {
        return NextResponse.json(
          {
            success: false,
            subject: uniqueId,
            error: 'Zoho token from caller is invalid/expired.',
          },
          { status: 401 },
        );
      }

      // Browser/automation retry: get a new token and retry once
      const retryTok =
        tok.source === 'browser'
          ? await getValidAccessTokenFromServer() // your helper should refresh if expired
          : (await getAutomationAccessToken()).accessToken;

      res = await axios.post(
        `${baseUrl}/crm/v6/Invoices`,
        { data: [payload] },
        {
          headers: {
            Authorization: `Bearer ${retryTok}`,
            'Content-Type': 'application/json',
          },
          validateStatus: () => true,
        },
      );
    }

    if (res.status < 200 || res.status >= 300) {
      return NextResponse.json(
        {
          success: false,
          subject: uniqueId,
          error: res?.data?.data?.[0]?.message || `Zoho HTTP ${res.status}`,
          zoho: res.data,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      subject: uniqueId,
      currentItemId,
      zoho: res.data,
    });
  } catch (err) {
    const { message } = parseAxiosError(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    );
  }
}

async function getAutomationAccessToken(): Promise<{
  accessToken: string;
  apiDomain?: string;
}> {
  if (!process.env.ZOHO_REFRESH_TOKEN) {
    // not configured -> skip fallback
    throw new Error('Automation refresh not configured');
  }
  const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID ?? '',
    client_secret: process.env.ZOHO_CLIENT_SECRET ?? '',
    refresh_token: process.env.ZOHO_REFRESH_TOKEN ?? '',
  });
  const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Zoho refresh failed: ${JSON.stringify(data)}`);
  }
  return {
    accessToken: data.access_token as string,
    apiDomain: data.api_domain as string | undefined,
  };
}

function buildUniqueId(
  d: string | Date,
  subject: string,
  currentItemId: number,
) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${format(date, 'ddMMyy')} ${subject} ${currentItemId}`;
}

function looksLikeInvalidToken(
  res: AxiosResponse<ZohoCreateInvoiceResponse, unknown>,
): boolean {
  const http401 = res.status === 401;
  const first = res.data?.data?.[0];
  const code = first?.code;
  const msg = (first?.message || first?.status || '') as string;
  return (
    http401 ||
    code === 'INVALID_OAUTHTOKEN' ||
    msg.toLowerCase().includes('invalid oauth token')
  );
}
/** Decide which Zoho token to use:
 * 1) If request has Authorization: Bearer <token> → use it (n8n mode, require x-api-key)
 * 2) Else try browser flow via getValidAccessTokenFromServer() (cookie-based)
 * 3) Else (optional) use automation env refresh (server-side)
 */
async function resolveZohoToken(req: NextRequest): Promise<{
  accessToken: string;
  source: 'n8n' | 'browser' | 'automation';
  apiDomain?: string;
}> {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    // n8n mode: also enforce our API key
    assertN8NApiKey(req.headers);
    const accessToken = auth.slice(7).trim();
    return { accessToken, source: 'n8n' };
  }

  // browser mode (your existing helper reads cookies/NextAuth context)
  const browserToken = await getValidAccessTokenFromServer();
  if (browserToken) return { accessToken: browserToken, source: 'browser' };

  // optional last-resort automation fallback (if configured)
  const auto = await getAutomationAccessToken().catch(() => null);
  if (auto)
    return {
      accessToken: auto.accessToken,
      apiDomain: auto.apiDomain,
      source: 'automation',
    };

  throw new Error(
    'No Zoho token available (no Bearer header, cookie token expired, and automation fallback disabled).',
  );
}
