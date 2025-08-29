import axios from 'axios';

type AxiosErrorDetails = {
  message: string;
  status?: number;
  code?: string | number;
  data?: unknown;
  details?: Record<string, unknown> | undefined;
};

export function parseAxiosError(err: unknown): AxiosErrorDetails {
  // Case 1: We already threw a parsed object earlier (e.g. from crmRequest)
  if (!axios.isAxiosError(err)) {
    if (err && typeof err === 'object') {
      const obj = err as any;
      if ('message' in obj || 'code' in obj || 'details' in obj) {
        return {
          message: obj.message ?? 'Unknown error',
          status: obj.status ?? obj.httpStatus,
          code: obj.code,
          data: obj.data,
          details: obj.details as Record<string, unknown> | undefined,
        };
      }
    }
    return {
      message: (err as Error)?.message || 'Unknown error',
    };
  }
  const res = err.response;
  const raw: any = res?.data;
  const detailsRaw = raw?.data?.[0]?.details ?? raw?.details;
  const code = raw?.data?.[0]?.code ?? raw?.code;
  // Make details JSON-serializable to avoid Next.js dropping it
  let details: Record<string, unknown> | undefined;
  try {
    details =
      detailsRaw != null
        ? (JSON.parse(JSON.stringify(detailsRaw)) as Record<string, unknown>)
        : undefined;
  } catch (_) {
    details = detailsRaw as Record<string, unknown> | undefined;
  }
  console.error('Zoho API Error:');
  console.error('Status:', res?.status);
  console.error('Data:', res?.data);
  console.error('URL:', err.config?.url);
  // console.error("Headers:", err.config?.headers);
  if (details) console.error('Error Details:', details);

  return {
    message: raw?.message || (err as any)?.message,
    status: res?.status,
    code,
    data: res?.data,
    details,
  };
}
