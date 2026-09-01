import {
  DEFAULT_SW_ISP_TOOLS,
  normalizeSwIspToolsList,
  type SwIspToolItem,
} from '@/lib/sw-isp-tools';

export async function fetchSwIspToolsMenu(idToken: string): Promise<SwIspToolItem[]> {
  try {
    const res = await fetch('/api/sw/isp-tools', {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({} as { items?: unknown }));
    if (!res.ok || !Array.isArray(body?.items)) {
      return [...DEFAULT_SW_ISP_TOOLS];
    }
    return normalizeSwIspToolsList(body.items);
  } catch {
    return [...DEFAULT_SW_ISP_TOOLS];
  }
}
