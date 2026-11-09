import {
  applicationNamesClearlyDifferent,
  isInactiveApplicationForDuplicateCheck,
} from '@/lib/ils-mif-consolidator-sync';
import { identityTokenLookupKeys } from '@/lib/member-identity';

/** Kaiser (and MRN-based) duplicate detection: same MRN + same name → block a second application. */

export type ApplicationDuplicateHit = {
  applicationId: string;
  path: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  status: string;
  healthPlan: string;
  isAdminSeed: boolean;
  matchedBy: 'mrn';
};

export type ApplicationDuplicateCheckResult = {
  blocked: boolean;
  message: string;
  samePersonMatches: ApplicationDuplicateHit[];
  differentNameMatches: ApplicationDuplicateHit[];
  /** Unclaimed admin-started seed the portal user may continue (not a 2nd app). */
  linkableAdminSeedId: string | null;
};

const clean = (value: unknown) => String(value ?? '').trim();

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export function mrnQueryValues(raw: unknown): string[] {
  const trimmed = clean(raw);
  if (!trimmed) return [];
  const keys = identityTokenLookupKeys(trimmed);
  return unique([trimmed, ...keys, trimmed.toUpperCase(), trimmed.toLowerCase()]);
}

export function isKaiserHealthPlan(value: unknown): boolean {
  const plan = clean(value).toLowerCase();
  return plan.includes('kaiser');
}

function toHit(
  applicationId: string,
  path: string,
  data: Record<string, unknown>
): ApplicationDuplicateHit {
  const status = clean(data.status);
  const isAdminSeed =
    applicationId.startsWith('admin_app_') || Boolean(data.createdByAdmin) || path.startsWith('applications/');
  return {
    applicationId,
    path,
    memberFirstName: clean(data.memberFirstName || data.confirmMemberFirstName),
    memberLastName: clean(data.memberLastName || data.confirmMemberLastName),
    memberMrn: clean(data.memberMrn || data.confirmMemberMrn || data.Member_MRN),
    status,
    healthPlan: clean(data.healthPlan),
    isAdminSeed,
    matchedBy: 'mrn',
  };
}

function isLinkableAdminSeed(hit: ApplicationDuplicateHit): boolean {
  if (!hit.isAdminSeed) return false;
  if (!hit.applicationId.startsWith('admin_app_') && !hit.path.startsWith('applications/')) return false;
  const status = hit.status.toLowerCase();
  if (status === 'approved' || status === 'completed & submitted' || status === 'deleted') return false;
  return true;
}

export function evaluateApplicationDuplicates(params: {
  hits: ApplicationDuplicateHit[];
  incoming: { memberFirstName?: string; memberLastName?: string };
  excludeApplicationId?: string;
  /** When true (portal user with no app yet), a single unclaimed admin seed is linkable, not a block. */
  allowLinkAdminSeed?: boolean;
}): ApplicationDuplicateCheckResult {
  const excludeId = clean(params.excludeApplicationId);
  const byId = new Map<string, ApplicationDuplicateHit>();
  for (const hit of params.hits) {
    if (excludeId && hit.applicationId === excludeId) continue;
    if (!byId.has(hit.applicationId)) byId.set(hit.applicationId, hit);
  }

  const samePersonMatches: ApplicationDuplicateHit[] = [];
  const differentNameMatches: ApplicationDuplicateHit[] = [];
  for (const hit of byId.values()) {
    if (
      applicationNamesClearlyDifferent(params.incoming, {
        memberFirstName: hit.memberFirstName,
        memberLastName: hit.memberLastName,
      })
    ) {
      differentNameMatches.push(hit);
    } else {
      samePersonMatches.push(hit);
    }
  }

  let linkableAdminSeedId: string | null = null;
  if (params.allowLinkAdminSeed && samePersonMatches.length > 0) {
    const linkable = samePersonMatches.filter(isLinkableAdminSeed);
    const onlyLinkableSeeds =
      linkable.length > 0 && samePersonMatches.every((m) => linkable.some((l) => l.applicationId === m.applicationId));
    if (onlyLinkableSeeds) {
      linkable.sort((a, b) => a.applicationId.localeCompare(b.applicationId));
      linkableAdminSeedId = linkable[0]?.applicationId || null;
    }
  }

  const blocked = samePersonMatches.length > 0 && !linkableAdminSeedId;
  const nameLabel = [clean(params.incoming.memberFirstName), clean(params.incoming.memberLastName)]
    .filter(Boolean)
    .join(' ');
  const first = samePersonMatches[0];
  const message = blocked
    ? `Application already exists for ${nameLabel || 'this member'}${
        first?.memberMrn ? ` (MRN ${first.memberMrn})` : ''
      }. Open the existing application instead of starting a new one.`
    : '';

  return {
    blocked,
    message,
    samePersonMatches,
    differentNameMatches,
    linkableAdminSeedId,
  };
}

/** Build hits from Firestore Admin SDK query results (root + collectionGroup). */
export function hitsFromAdminDocs(
  docs: Array<{ id: string; ref: { path: string }; data: () => Record<string, unknown> }>
): ApplicationDuplicateHit[] {
  const hits: ApplicationDuplicateHit[] = [];
  const seen = new Set<string>();
  for (const docSnap of docs) {
    const path = String(docSnap.ref?.path || '');
    if (seen.has(path) || seen.has(docSnap.id)) continue;
    const data = docSnap.data() || {};
    if (isInactiveApplicationForDuplicateCheck(data)) continue;
    seen.add(path);
    seen.add(docSnap.id);
    hits.push(toHit(docSnap.id, path, data));
  }
  return hits;
}
