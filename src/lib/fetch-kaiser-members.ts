import { API_PATHS } from '@/lib/api-paths';

export type KaiserMembersApiResponse = {
  success?: boolean;
  members?: unknown[];
  count?: number;
  timestamp?: string;
  source?: string;
  error?: string;
};

export type FetchKaiserMembersOptions = {
  source?: 'cache' | 'caspio';
  refresh?: boolean;
  clientId2?: string;
  timeoutMs?: number;
  requireNonEmpty?: boolean;
  /** Short phrase for error messages, e.g. "click Re-check Caspio again". */
  retryAction?: string;
};

const DEFAULT_TIMEOUT_MS = 120_000;

function buildKaiserMembersUrl(options?: FetchKaiserMembersOptions): string {
  const params = new URLSearchParams();
  if (options?.source === 'caspio') {
    params.set('source', 'caspio');
  } else if (options?.source === 'cache') {
    params.set('source', 'cache');
  }
  if (options?.refresh) params.set('refresh', '1');
  const clientId2 = String(options?.clientId2 || '').trim();
  if (clientId2) params.set('clientId2', clientId2);
  const qs = params.toString();
  return qs ? `${API_PATHS.kaiserMembers}?${qs}` : API_PATHS.kaiserMembers;
}

export function formatKaiserMembersFetchError(
  error: unknown,
  options?: { retryAction?: string; context?: string }
): string {
  const retryAction = String(options?.retryAction || 'try again').trim();
  const context = String(options?.context || 'Kaiser Caspio cache').trim();
  const retrySentence =
    retryAction.charAt(0).toUpperCase() + retryAction.slice(1);

  if (error instanceof DOMException && error.name === 'AbortError') {
    return `Timed out loading ${context} (over 2 minutes). ${retrySentence}, or sync Caspio members if the cache is stale.`;
  }

  const message = String((error as { message?: string })?.message || 'Unknown error');
  if (message === 'Failed to fetch' || message.toLowerCase().includes('networkerror')) {
    return `Network error loading ${context}. Check your connection and ${retryAction}. If this keeps happening, sync Caspio members from Admin first.`;
  }

  return message;
}

export async function fetchKaiserMembers<TMember = unknown>(
  options?: FetchKaiserMembersOptions
): Promise<{
  members: TMember[];
  meta: Pick<KaiserMembersApiResponse, 'count' | 'timestamp' | 'source'>;
}> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryAction = options?.retryAction || 'try again';
  const controller = new AbortController();
  const timeoutId =
    typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  try {
    const response = await fetch(buildKaiserMembersUrl(options), {
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as KaiserMembersApiResponse;
    if (!response.ok || !data?.success || !Array.isArray(data?.members)) {
      throw new Error(
        String(data?.error || `Failed to load Kaiser members (HTTP ${response.status})`)
      );
    }

    const members = data.members as TMember[];
    if (options?.requireNonEmpty && members.length === 0) {
      throw new Error(
        'No Kaiser members found in Caspio cache. Sync Caspio members, then try again.'
      );
    }

    return {
      members,
      meta: {
        count: data.count,
        timestamp: data.timestamp,
        source: data.source,
      },
    };
  } catch (error: unknown) {
    throw new Error(formatKaiserMembersFetchError(error, { retryAction }));
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}
