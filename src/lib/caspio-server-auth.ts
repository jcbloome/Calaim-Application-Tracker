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
  const credentials = Buffer.from(`${resolved.clientId}:${resolved.clientSecret}`).toString('base64');
  const tokenUrl = `${resolved.oauthBaseUrl}/oauth/token`;
  const tokenBody = new URLSearchParams({ grant_type: 'client_credentials' });

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: tokenBody.toString(),
  });

  let resolvedResponse = tokenResponse;
  if (!resolvedResponse.ok) {
    const fallbackBody = new URLSearchParams(tokenBody);
    fallbackBody.set('client_id', resolved.clientId);
    fallbackBody.set('client_secret', resolved.clientSecret);
    const fallbackResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: fallbackBody.toString(),
    });

    if (fallbackResponse.ok) {
      resolvedResponse = fallbackResponse;
    } else {
      const errorText = await tokenResponse.text().catch(() => '');
      const fallbackErrorText = await fallbackResponse.text().catch(() => '');
      throw new Error(
        `Failed to get Caspio access token (${tokenUrl}): primary=${tokenResponse.status} ${errorText} | fallback=${fallbackResponse.status} ${fallbackErrorText}`
      );
    }
  }

  const tokenData = await resolvedResponse.json();
  const accessToken = String(tokenData?.access_token || '');
  if (!accessToken) {
    throw new Error('Caspio token response missing access_token');
  }

  return accessToken;
}
