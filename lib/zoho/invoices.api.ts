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
  // Strategy: rely on external header for upsert on /Invoices (works on v8).
  // If your org is on v2 upsert endpoint, switch to `/Invoices/upsert`.
  const path = `/Invoices`;
  const resp = await crmRequest<ZohoRecordResp>(accessToken, path, {
    method: 'POST',
    data: JSON.stringify({ data: [record] }),
  });
  return resp.data[0].details.id;
}
