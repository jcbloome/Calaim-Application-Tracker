import 'server-only';

const REQUIRED_SERVER_ENV_IN_PRODUCTION = [
  'CASPIO_BASE_URL',
  'CASPIO_CLIENT_ID',
  'CASPIO_CLIENT_SECRET',
  'RESEND_API_KEY',
  'CRON_SECRET',
] as const;

let validated = false;

function getMissingVars(variableNames: readonly string[]): string[] {
  return variableNames.filter((name) => !String(process.env[name] || '').trim());
}

export function validateServerEnvironment(): void {
  if (validated) return;
  validated = true;

  const isProduction = process.env.NODE_ENV === 'production';
  const missing = getMissingVars(REQUIRED_SERVER_ENV_IN_PRODUCTION);

  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (appUrl.includes(',')) {
    const message = '[env] NEXT_PUBLIC_APP_URL must contain a single URL value, not a comma-separated list.';
    if (isProduction) {
      throw new Error(message);
    }
    console.warn(message);
  }

  if (!missing.length) return;

  const message = `[env] Missing required server environment variables: ${missing.join(', ')}`;
  if (isProduction) {
    throw new Error(message);
  }

  console.warn(`${message}. Running in non-production mode; validation is warn-only.`);
}
