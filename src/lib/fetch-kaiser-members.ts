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
  /** Last name / free-text name lookup for on-demand Caspio pull. */
  q?: string;
  timeoutMs?: number;
  requireNonEmpty?: boolean;
  /** Short phrase for error messages, e.g. "click Re-check Caspio again". */
  retryAction?: string;
  /**
   * Reuse the full member list loaded by any admin page in this browser session if it is newer than
   * this many ms. Use for page-load fetches; leave unset for explicit reloads so staff get fresh data.
   * Ignored for refresh / clientId2 / q requests.
   */
  maxAgeMs?: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;

/** Default freshness window for page-load member fetches that opt into the session cache. */
export const KAISER_MEMBERS_SESSION_MAX_AGE_MS = 3 * 60 * 1000;

type KaiserMembersSessionEntry = {
  members: unknown[];
  meta: Pick<KaiserMembersApiResponse, 'count' | 'timestamp' | 'source'>;
  fetchedAtMs: number;
  /** True when the list came straight from Caspio rather than the Firestore mirror. */
  live: boolean;
};

let sessionEntry: KaiserMembersSessionEntry | null = null;
const sessionInFlight = new Map<string, Promise<{ members: unknown[]; meta: KaiserMembersSessionEntry['meta'] }>>();

const isFullListRequest = (options?: FetchKaiserMembersOptions) =>
  !String(options?.clientId2 || '').trim() && !String(options?.q || '').trim();

/** Forget the session copy so the next page-load fetch hits the server. */
export function invalidateKaiserMembersCache(): void {
  sessionEntry = null;
}

/** Age in ms of the session copy, or null when nothing is cached. */
export function getKaiserMembersCacheAgeMs(): number | null {
  return sessionEntry ? Date.now() - sessionEntry.fetchedAtMs : null;
}

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
  const q = String(options?.q || '').trim();
  if (q) params.set('q', q);
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
  const fullList = isFullListRequest(options);
  const wantsLive = options?.source === 'caspio';
  const canReuse = fullList && !options?.refresh && typeof options?.maxAgeMs === 'number' && options.maxAgeMs > 0;

  if (canReuse && sessionEntry) {
    const fresh = Date.now() - sessionEntry.fetchedAtMs <= (options!.maxAgeMs as number);
    if (fresh && (!wantsLive || sessionEntry.live) && (!options?.requireNonEmpty || sessionEntry.members.length > 0)) {
      return { members: [...sessionEntry.members] as TMember[], meta: sessionEntry.meta };
    }
  }

  const url = buildKaiserMembersUrl(options);
  if (canReuse) {
    const pending = sessionInFlight.get(url);
    if (pending) {
      const shared = await pending;
      return { members: shared.members as TMember[], meta: shared.meta };
    }
  }

  const request = fetchKaiserMembersFromServer(url, options).then((result) => {
    if (fullList) {
      const source = String(result.meta.source || '').toLowerCase();
      sessionEntry = {
        members: result.members,
        meta: result.meta,
        fetchedAtMs: Date.now(),
        live: Boolean(source) && !source.includes('firestore'),
      };
    }
    return result;
  });
  if (fullList) {
    sessionInFlight.set(url, request);
    request.finally(() => sessionInFlight.delete(url)).catch(() => {});
  }
  const result = await request;
  return { members: result.members as TMember[], meta: result.meta };
}

async function fetchKaiserMembersFromServer(
  url: string,
  options?: FetchKaiserMembersOptions
): Promise<{ members: unknown[]; meta: KaiserMembersSessionEntry['meta'] }> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryAction = options?.retryAction || 'try again';
  const controller = new AbortController();
  const timeoutId =
    typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as KaiserMembersApiResponse;
    if (!response.ok || !data?.success || !Array.isArray(data?.members)) {
      throw new Error(
        String(data?.error || `Failed to load Kaiser members (HTTP ${response.status})`)
      );
    }

    const members = data.members;
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
