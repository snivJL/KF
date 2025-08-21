import axios from "axios";

const BASE_URL = process.env.BASE_URL as string;
if (!BASE_URL) throw new Error("Missing BASE_URL");

type Info = {
  per_page: number;
  count: number;
  page: number;
  more_records: boolean;
  next_page_token: string | null;
};

type Resp = { data?: Array<{ id: string }>; info: Info };

export async function listAllInvoiceIds(
  token: string,
  perPage = 2000,
  max = 100_000
): Promise<string[]> {
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  const ids: string[] = [];

  // Up to 2,000 via page=1..10
  for (let p = 1; p <= 10 && ids.length < max; p++) {
    const url = `${BASE_URL}/crm/v6/Invoices?fields=id&per_page=${perPage}&page=${p}`;
    const r = await axios.get<Resp>(url, { headers });
    const batch = r.data?.data ?? [];
    if (!batch.length) break;
    ids.push(...batch.map((x) => x.id));
    console.log(`[listAllInvoiceIds] Fetched ${ids.length} IDs`);

    if (!r.data.info?.more_records) return ids.slice(0, max);
  }

  // Beyond 2,000 use page_token
  const r10 = await axios.get<Resp>(
    `${BASE_URL}/crm/v8/Invoices?fields=id&per_page=${perPage}&page=10`,
    { headers }
  );
  let tok = r10.data?.info?.next_page_token || null;

  while (tok && ids.length < max) {
    const url = `${BASE_URL}/crm/v8/Invoices?fields=id&per_page=${perPage}&page_token=${encodeURIComponent(
      tok
    )}`;
    const r = await axios.get<Resp>(url, { headers });
    const batch = r.data?.data ?? [];
    console.log(
      `[listAllInvoiceIds] with page token Fetched ${ids.length} IDs`
    );
    console.log("Page Number", r.data?.info?.page);

    if (!batch.length) break;
    ids.push(...batch.map((x) => x.id));
    tok = r.data?.info?.next_page_token || null;
  }

  return ids.slice(0, max);
}

export async function getInvoiceWithSubform(token: string, id: string) {
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  const url = `${BASE_URL}/crm/v6/Invoices/${id}`;
  const r = await axios.get<{ data?: any[] }>(url, { headers });

  return (r.data?.data ?? [])[0] ?? null;
}
