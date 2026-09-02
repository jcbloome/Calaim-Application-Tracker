export type IspLayoutMode = 'desktop' | 'mobile';

export const ISP_LAYOUT_MODE_STORAGE_KEY = 'calaim_isp_layout_mode';

export function parseIspLayoutMode(value: unknown): IspLayoutMode {
  return String(value || '').trim().toLowerCase() === 'mobile' ? 'mobile' : 'desktop';
}

export function readIspLayoutMode(): IspLayoutMode {
  if (typeof window === 'undefined') return 'desktop';
  try {
    return parseIspLayoutMode(window.localStorage.getItem(ISP_LAYOUT_MODE_STORAGE_KEY));
  } catch {
    return 'desktop';
  }
}

export function writeIspLayoutMode(mode: IspLayoutMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ISP_LAYOUT_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore storage failures
  }
}
