import { crmRequest, type ZohoRecordResp } from './api';

export async function updateInvoice(
  accessToken: string,
  crmId: string,
  record: Record<string, unknown>,
) {
  const path = `/Invoices/${crmId}`;
  await crmRequest(accessToken, path, {
    method: 'PUT',
    data: JSON.stringify({ data: [record] }),
  });
}

export async function clearSubform(accessToken: string, crmId: string) {
  await updateInvoice(accessToken, crmId, {
    id: crmId,
    Invoiced_Items: '',
  });
}

export async function deleteInvoice(accessToken: string, crmId: string) {
  const path = `/Invoices/${crmId}`;
  await crmRequest(accessToken, path, { method: 'DELETE' });
}

export async function upsertInvoiceByExternalKey(
  accessToken: string,
  record: Record<string, unknown>,
): Promise<string> {
  const path = `/Invoices`;
  const resp = await crmRequest<ZohoRecordResp>(accessToken, path, {
    method: 'POST',
    data: JSON.stringify({ data: [record] }),
  });
  return resp.data[0].details.id;
}

export async function insertInvoice(
  accessToken: string,
  record: Record<string, unknown>,
): Promise<string> {
  const path = `/Invoices`;
  const resp = await crmRequest<ZohoRecordResp>(accessToken, path, {
    method: 'POST',
    data: JSON.stringify({ data: [record] }),
  });
  return resp.data[0].details.id;
}

export const getInvoices = async (
  accessToken: string,
  criteria: string, // <-- change to string
  page = 1,
  perPage = 100,
) => {
  const path = `/Invoices/search?criteria=${encodeURIComponent(criteria)}&page=${page}&per_page=${perPage}`;

  const resp = await crmRequest<ZohoRecordResp>(accessToken, path, {
    method: 'GET',
  });
  return resp.data;
};

export async function findInvoiceIdByExternalKey(
  accessToken: string,
  externalKey: string,
): Promise<string | null> {
  const criteria = `(External_Invoice_Key__C:equals:${externalKey})`;
  const data = await getInvoices(accessToken, criteria, 1, 1);
  const id = (data as any)?.[0]?.details?.id ?? (data as any)?.[0]?.id;
  return (id as string) ?? null;
}
