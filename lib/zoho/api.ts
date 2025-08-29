import axios, { type AxiosRequestConfig } from 'axios';
import { parseAxiosError } from '../errors';

export async function crmRequest<T>(
  accessToken: string,
  path: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const base = process.env.BASE_URL;
  console.log('crmRequest', path, config);
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
    throw parseAxiosError(err);
  }
}

export type ZohoRecordResp = {
  data: { details: { id: string } }[];
};
