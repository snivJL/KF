import { crmRequest } from './api';

type FieldsReponse = {
  fields: Record<string, unknown>[];
};

export async function getModuleFields(accessToken: string, module: string) {
  try {
    const path = `/settings/fields?module=${module}`;

    const res = await crmRequest<FieldsReponse>(accessToken, path, {
      method: 'GET',
    });
    return res.fields;
  } catch (error) {}
}
