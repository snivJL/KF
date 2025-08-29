import axios, { type AxiosRequestConfig } from 'axios';
import { parseAxiosError } from '../errors';

export async function crmRequest<T>(
  accessToken: string,
  path: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const base = process.env.BASE_URL;
  const maxRetries = 5;
  const baseDelayMs = 800; // initial backoff
  const jitterMs = 250;

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.request<T>({
        url: `${base}/crm/v6${path}`,
        method: config?.method || 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
          ...(config?.headers ?? {}),
        },
        data: config?.data,
        params: config?.params,
      });
      return response.data;
    } catch (err) {
      // Retry on 429 and selected 5xx errors with exponential backoff
      if (axios.isAxiosError(err)) {
        const status = err.response?.status ?? 0;
        const retryAfterHeader = err.response?.headers?.['retry-after'];
        const retryAfterMs = retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : null;
        const shouldRetry =
          status === 429 || status === 502 || status === 503 || status === 504;
        if (shouldRetry && attempt < maxRetries) {
          const backoff =
            retryAfterMs ??
            Math.round(
              baseDelayMs * Math.pow(2, attempt) + Math.random() * jitterMs,
            );
          // eslint-disable-next-line no-console
          console.warn(
            `Zoho request throttled (status ${status}). Retrying in ${backoff}ms… [attempt ${
              attempt + 1
            }/${maxRetries}] ${err.config?.url}`,
          );
          await sleep(backoff);
          continue;
        }
      }
      throw parseAxiosError(err);
    }
  }
  // Should never reach here
  throw new Error('crmRequest: exhausted retries');
}

export type ZohoRecordResp = {
  data: { details: { id: string } }[];
};

export async function asyncPool<I, O>(
  limit: number,
  items: I[],
  worker: (item: I) => Promise<O>,
): Promise<O[]> {
  const results: O[] = [];
  const executing: Promise<unknown>[] = [];

  for (const item of items) {
    const task = worker(item).then((res) => {
      results.push(res);
    });

    // Track the exact promise reference we push, so removal works
    executing.push(task);

    // When task settles, remove it from executing to free a slot
    task.finally(() => {
      const idx = executing.indexOf(task);
      if (idx >= 0) executing.splice(idx, 1);
    });

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
