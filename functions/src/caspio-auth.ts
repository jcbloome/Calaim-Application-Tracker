export type CaspioConfig = {
  oauthBaseUrl: string;
  restBaseUrl: string;
  clientId: string;
  clientSecret: string;
};

const CASPIO_REST_PATH = '/integrations/rest/v3';

export function buildCaspioConfig(rawBaseUrl: string, clientId: string, clientSecret: string): CaspioConfig {
  const oauthBaseUrl = String(rawBaseUrl || '')
    .replace(/\/rest\/v2\/?$/i, '')
    .replace(/\/integrations\/rest\/v3\/?$/i, '')
    .replace(/\/+$/g, '');
  return {
    oauthBaseUrl,
    restBaseUrl: `${oauthBaseUrl}${CASPIO_REST_PATH}`,
    clientId: String(clientId || '').trim(),
    clientSecret: String(clientSecret || '').trim(),
  };
}

export async function getCaspioAccessTokenFromConfig(config: CaspioConfig): Promise<string> {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const tokenUrl = `${config.oauthBaseUrl}/oauth/token`;

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text().catch(() => '');
    throw new Error(`Failed to get Caspio access token: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = String(tokenData?.access_token || '');
  if (!accessToken) {
    throw new Error('Caspio token response missing access_token');
  }

  return accessToken;
}
