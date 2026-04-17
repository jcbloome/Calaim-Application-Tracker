import { validateServerEnvironment } from '@/lib/server-env-validation';

export async function register() {
  validateServerEnvironment();
}
