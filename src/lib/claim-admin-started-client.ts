import type { User } from 'firebase/auth';

export async function claimAdminStartedApplicationsClient(
  user: User,
  options?: { applicationId?: string }
) {
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/applications/claim-admin-started', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        applicationId: String(options?.applicationId || '').trim() || undefined,
      }),
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

export function applicationIdFromRedirectPath(redirectPath: string): string {
  try {
    const redirectUrl = new URL(redirectPath, 'https://example.local');
    return String(redirectUrl.searchParams.get('applicationId') || '').trim();
  } catch {
    return '';
  }
}
