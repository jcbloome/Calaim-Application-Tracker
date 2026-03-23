export type CaspioServerConfig = {
  oauthBaseUrl: string;
  restBaseUrl: string;
  clientId: string;
  clientSecret: string;
};

export function getCaspioServerConfig(): CaspioServerConfig {
  const rawBaseUrl = process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com/rest/v2';
  const oauthBaseUrl = String(rawBaseUrl).replace(/\/rest\/v2\/?$/i, '').replace(/\/+$/g, '');
  const restBaseUrl = `${oauthBaseUrl}/rest/v2`;
  const clientId = process.env.CASPIO_CLIENT_ID || '';
  const clientSecret = process.env.CASPIO_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    throw new Error('Caspio credentials are not configured');
  }

  return { oauthBaseUrl, restBaseUrl, clientId, clientSecret };
}

export async function getCaspioServerAccessToken(config?: CaspioServerConfig): Promise<string> {
  const resolved = config ?? getCaspioServerConfig();
  const credentials = Buffer.from(`${resolved.clientId}:${resolved.clientSecret}`).toString('base64');
  const tokenUrl = `${resolved.oauthBaseUrl}/oauth/token`;

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
