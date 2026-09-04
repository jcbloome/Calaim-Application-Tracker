export type SwIspToolItem = {
  id: string;
  label: string;
  /** Internal SW portal path or absolute URL / Firebase download URL. */
  href: string;
  description?: string;
  /** true = show in SW portal ISP Tools menu */
  active: boolean;
  sortOrder: number;
  /** Optional uploaded file metadata */
  fileName?: string;
  storagePath?: string;
  uploadedAtIso?: string;
};

export const SW_ISP_TOOLS_SETTINGS_DOC = 'sw-isp-tools';

export const DEFAULT_SW_ISP_TOOLS: SwIspToolItem[] = [
  {
    id: 'alft-assessment',
    label: 'ALFT Assessment',
    href: '/sw-portal/alft-upload',
    description: 'Complete and submit Kaiser ALFT / ISP assessments',
    active: true,
    sortOrder: 10,
  },
  {
    id: 'alft-instructions',
    label: 'ALFT Instructions',
    href: '/sw-portal/alft-instructions',
    description: 'Clinical documentation guidance for ALFT forms',
    active: true,
    sortOrder: 20,
  },
  {
    id: 'tier-level-definitions',
    label: 'Tier Level Definitions',
    href: '/sw-portal/tier-level-definitions',
    description: 'Five-tier definitions used for ALFT / assisted-living tier recommendations',
    active: true,
    sortOrder: 30,
  },
];

export function normalizeSwIspToolItem(raw: any, index = 0): SwIspToolItem | null {
  const id = String(raw?.id || `tool-${index + 1}`).trim();
  const label = String(raw?.label || '').trim();
  const href = String(raw?.href || '').trim();
  if (!id || !label || !href) return null;
  return {
    id,
    label,
    href,
    description: String(raw?.description || '').trim() || undefined,
    active: raw?.active !== false,
    sortOrder: Number.isFinite(Number(raw?.sortOrder)) ? Number(raw.sortOrder) : (index + 1) * 10,
    fileName: String(raw?.fileName || '').trim() || undefined,
    storagePath: String(raw?.storagePath || '').trim() || undefined,
    uploadedAtIso: String(raw?.uploadedAtIso || '').trim() || undefined,
  };
}

export function normalizeSwIspToolsList(raw: unknown): SwIspToolItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_SW_ISP_TOOLS];
  const items = raw
    .map((row, index) => normalizeSwIspToolItem(row, index))
    .filter(Boolean) as SwIspToolItem[];
  if (!items.length) return [...DEFAULT_SW_ISP_TOOLS];
  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function activeSwIspTools(items: SwIspToolItem[]): SwIspToolItem[] {
  return items.filter((item) => item.active && item.href && item.label);
}

/** Uploaded PDF/doc tools store href in Firebase Storage — admins should not edit the link manually. */
export function isUploadedSwIspTool(item: Pick<SwIspToolItem, 'fileName' | 'storagePath' | 'href' | 'id'>): boolean {
  if (String(item.fileName || '').trim() || String(item.storagePath || '').trim()) return true;
  if (String(item.id || '').startsWith('upload-')) return true;
  return /^https?:\/\//i.test(String(item.href || '').trim()) && String(item.href || '').includes('firebasestorage.googleapis.com');
}

/** Firestore rejects `undefined` field values — strip them before setDoc. */
export function swIspToolsForFirestore(items: SwIspToolItem[]): Array<Record<string, unknown>> {
  return normalizeSwIspToolsList(items).map((item) => {
    const row: Record<string, unknown> = {
      id: item.id,
      label: item.label,
      href: item.href,
      active: item.active,
      sortOrder: item.sortOrder,
    };
    if (item.description) row.description = item.description;
    if (item.fileName) row.fileName = item.fileName;
    if (item.storagePath) row.storagePath = item.storagePath;
    if (item.uploadedAtIso) row.uploadedAtIso = item.uploadedAtIso;
    return row;
  });
}
