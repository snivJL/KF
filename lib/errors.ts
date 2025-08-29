import axios from 'axios';

type AxiosErrorDetails = {
  message: string;
  status?: number;
  data?: unknown;
  details?: unknown;
};

export function parseAxiosError(err: unknown): AxiosErrorDetails {
  if (!axios.isAxiosError(err)) {
    return {
      message: (err as Error)?.message || 'Unknown error',
    };
  }

  const res = err.response;
  const details = res?.data?.data?.[0]?.details;
  console.error('Zoho API Error:');
  console.error('Status:', res?.status);
  console.error('Data:', res?.data);
  console.error('URL:', err.config?.url);
  // console.error("Headers:", err.config?.headers);
  if (details) console.error('Error Details:', details);

  return {
    message: res?.data?.message || err.message,
    status: res?.status,
    data: res?.data,
    details,
  };
}
