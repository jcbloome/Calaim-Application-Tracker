import {
  getKaiserStatusByName,
  normalizeKaiserStatusName,
} from '@/lib/kaiser-status-progression';

export type FileSystemPlanBucket = 'kaiser' | 'health-net' | 'other';
export type FileSystemActiveBucket = 'active' | 'non-active';
export type FileSystemPlacementOverride = FileSystemActiveBucket | null;

type AppLike = Record<string, unknown>;

const normalizeToken = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');

const NON_ACTIVE_KEYWORDS = ['non active', 'inactive', 'on hold', 'case closed', 'closed'];

const ACTIVE_KEYWORDS = ['active', 'in progress', 'requested', 'received', 'needed', 'pending'];

export const normalizeFileSystemPlan = (app: AppLike): FileSystemPlanBucket => {
  const plan = normalizeToken(app.healthPlan || app.CalAIM_MCO || app.CalAIM_MCP || app.mcpName);
  if (plan.includes('kaiser')) return 'kaiser';
  if (plan.includes('health net') || plan.includes('healthnet')) return 'health-net';
  return 'other';
};

export const getCaseStatusForPlan = (app: AppLike, plan: FileSystemPlanBucket): string => {
  if (plan === 'kaiser') {
    return String(app.kaiserStatus || app.Kaiser_Status || '').trim();
  }
  if (plan === 'health-net') {
    return String(app.Health_Net_Process_Status || app.healthNetStatus || '').trim();
  }
  return '';
};

const getManualOverride = (app: AppLike): FileSystemPlacementOverride => {
  const raw = normalizeToken(app.fileSystemPlacementOverride);
  if (raw === 'active') return 'active';
  if (raw === 'non-active' || raw === 'non active') return 'non-active';
  return null;
};

const isLikelyNonActive = (status: string) => {
  const normalized = normalizeToken(status);
  return NON_ACTIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const isLikelyActive = (status: string) => {
  const normalized = normalizeToken(status);
  return ACTIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const deriveStatusBucket = (
  plan: FileSystemPlanBucket,
  status: string
): FileSystemActiveBucket => {
  if (!status.trim()) return 'active';

  if (plan === 'kaiser') {
    const canonical = normalizeKaiserStatusName(status);
    const definition = getKaiserStatusByName(canonical);
    if (definition) {
      return definition.isActive ? 'active' : 'non-active';
    }
  }

  if (isLikelyNonActive(status)) return 'non-active';
  if (isLikelyActive(status)) return 'active';
  return 'active';
};

export type FileSystemPlacementResult = {
  plan: FileSystemPlanBucket;
  bucket: FileSystemActiveBucket;
  source: 'auto' | 'manual';
  status: string;
  override: FileSystemPlacementOverride;
};

export const getApplicationFileSystemPlacement = (
  app: AppLike
): FileSystemPlacementResult => {
  const plan = normalizeFileSystemPlan(app);
  const status = getCaseStatusForPlan(app, plan);
  const override = getManualOverride(app);
  const bucket = override || deriveStatusBucket(plan, status);
  return {
    plan,
    bucket,
    source: override ? 'manual' : 'auto',
    status,
    override,
  };
};

export const getFileSystemFolderKey = (
  plan: FileSystemPlanBucket,
  bucket: FileSystemActiveBucket
) => `${plan}:${bucket}`;
