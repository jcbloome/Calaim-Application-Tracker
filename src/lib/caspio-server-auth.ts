import { getCaspioToken } from '@/lib/caspio-api-utils';

export type CaspioServerConfig = {
  oauthBaseUrl: string;
  restBaseUrl: string;
  clientId: string;
  clientSecret: string;
};

const CASPIO_REST_PATH = '/integrations/rest/v3';

export function getCaspioServerConfig(): CaspioServerConfig {
  const rawBaseUrl = process.env.CASPIO_BASE_URL || `https://c7ebl500.caspio.com${CASPIO_REST_PATH}`;
  const oauthBaseUrl = String(rawBaseUrl)
    .replace(/\/rest\/v2\/?$/i, '')
    .replace(/\/integrations\/rest\/v3\/?$/i, '')
    .replace(/\/+$/g, '');
  const restBaseUrl = `${oauthBaseUrl}${CASPIO_REST_PATH}`;
  const clientId = String(process.env.CASPIO_CLIENT_ID || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\s+/g, '');
  const clientSecret = String(process.env.CASPIO_CLIENT_SECRET || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\s+/g, '');

  if (!clientId || !clientSecret) {
    throw new Error('Caspio credentials are not configured');
  }

  return { oauthBaseUrl, restBaseUrl, clientId, clientSecret };
}

export async function getCaspioServerAccessToken(config?: CaspioServerConfig): Promise<string> {
  const resolved = config ?? getCaspioServerConfig();
  return getCaspioToken({
    baseUrl: resolved.oauthBaseUrl,
    clientId: resolved.clientId,
    clientSecret: resolved.clientSecret,
  });
}
